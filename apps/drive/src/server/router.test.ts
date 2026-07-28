import { describe, expect, test, beforeEach } from "vite-plus/test";
import { createRouter } from "./router";
import { createTestD1, D1Shim } from "../test/d1-shim";
import { R2Mock } from "../test/r2-mock";
import { MULTIPART_PART_SIZE, SINGLE_UPLOAD_MAX_BYTES } from "./impl/files";

function makeTestEnv(db: D1Shim, files: R2Mock) {
  return {
    DB: db as unknown as D1Database,
    FILES: files as unknown as R2Bucket,
    AUTH_ISSUER_URL: "https://auth.test.example.com",
    AUTH_CLIENT_ID: "shedflare-drive-test",
    APP_PUBLIC_URL: "https://drive.test.example.com",
    OWNER_EMAIL: "test@example.com",
    DEV_AUTH_EMAIL: "test@example.com",
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  };
}

function makeRequest(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

describe("file API", () => {
  let db: D1Shim;
  let r2: R2Mock;
  let router: ReturnType<typeof createRouter>;

  beforeEach(() => {
    db = createTestD1();
    r2 = new R2Mock();
    router = createRouter(makeTestEnv(db, r2) as never);
  });

  test("GET /api/files returns empty list", async () => {
    const res = await router.fetch(makeRequest("/api/files"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: unknown[]; nextOffset: number | null };
    expect(body.files).toEqual([]);
    expect(body.nextOffset).toBeNull();
  });

  test("POST /api/files creates a file", async () => {
    const form = new FormData();
    form.set("file", new File(["hello world"], "test.txt", { type: "text/plain" }));
    form.set("name", "custom-name.txt");
    form.set("description", "a test file");
    form.set("tags", "work,important");

    const res = await router.fetch(makeRequest("/api/files", { method: "POST", body: form }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      file: { id: string; name: string; description: string; tags: string[] };
    };
    expect(body.file.name).toBe("custom-name.txt");
    expect(body.file.description).toBe("a test file");
    expect(body.file.tags).toContain("work");
    expect(body.file.tags).toContain("important");
  });

  test("POST /api/files uses file name when no custom name", async () => {
    const form = new FormData();
    form.set("file", new File(["content"], "original.txt", { type: "text/plain" }));

    const res = await router.fetch(makeRequest("/api/files", { method: "POST", body: form }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { file: { name: string } };
    expect(body.file.name).toBe("original.txt");
  });

  test("POST /api/files returns 400 without file", async () => {
    const form = new FormData();
    form.set("name", "no-file");

    const res = await router.fetch(makeRequest("/api/files", { method: "POST", body: form }));
    expect(res.status).toBe(400);
  });

  test("POST /api/files rejects oversized single-request uploads with an actionable error", async () => {
    const res = await router.fetch(
      makeRequest("/api/files", {
        method: "POST",
        headers: { "content-length": String(SINGLE_UPLOAD_MAX_BYTES + 1) },
        body: "too large",
      }),
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({
      code: "single_upload_too_large",
      retryable: false,
    });
  });

  test("multipart upload stores a large file and its metadata", async () => {
    const finalChunk = new TextEncoder().encode("final chunk");
    const size = MULTIPART_PART_SIZE + finalChunk.length;
    const createRes = await router.fetch(
      makeRequest("/api/files/multipart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "large-video.mp4",
          mimeType: "video/mp4",
          size,
          description: "large upload",
          tags: "video, archive",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const session = (await createRes.json()) as {
      fileId: string;
      uploadId: string;
      partSize: number;
    };
    expect(session.partSize).toBe(MULTIPART_PART_SIZE);

    const firstChunk = new Uint8Array(MULTIPART_PART_SIZE);
    firstChunk.fill(7);
    const uploadedParts: Array<{ partNumber: number; etag: string }> = [];
    for (const [index, chunk] of [firstChunk, finalChunk].entries()) {
      const partNumber = index + 1;
      const partRes = await router.fetch(
        makeRequest(`/api/files/multipart/${session.fileId}/parts/${partNumber}`, {
          method: "PUT",
          headers: { "x-shedflare-upload-id": session.uploadId },
          body: chunk,
        }),
      );
      expect(partRes.status).toBe(200);
      uploadedParts.push((await partRes.json()) as { partNumber: number; etag: string });
    }

    const completeRes = await router.fetch(
      makeRequest(`/api/files/multipart/${session.fileId}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadId: session.uploadId,
          parts: uploadedParts,
          name: "large-video.mp4",
          mimeType: "video/mp4",
          size,
          description: "large upload",
          tags: "video, archive",
        }),
      }),
    );
    expect(completeRes.status).toBe(201);
    const completed = (await completeRes.json()) as {
      file: { id: string; name: string; size: number; tags: string[] };
    };
    expect(completed.file).toMatchObject({
      id: session.fileId,
      name: "large-video.mp4",
      size,
    });
    expect(completed.file.tags.sort()).toEqual(["archive", "video"]);

    const downloadRes = await router.fetch(makeRequest(`/api/files/${session.fileId}/download`));
    expect(downloadRes.status).toBe(200);
    expect((await downloadRes.arrayBuffer()).byteLength).toBe(size);
    expect(r2.pendingMultipartUploads).toBe(0);
  });

  test("multipart upload can be canceled without leaving an object", async () => {
    const createRes = await router.fetch(
      makeRequest("/api/files/multipart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "canceled.bin",
          mimeType: "application/octet-stream",
          size: MULTIPART_PART_SIZE + 1,
          description: "",
          tags: "",
        }),
      }),
    );
    const session = (await createRes.json()) as { fileId: string; uploadId: string };

    const abortRes = await router.fetch(
      makeRequest(`/api/files/multipart/${session.fileId}`, {
        method: "DELETE",
        headers: { "x-shedflare-upload-id": session.uploadId },
      }),
    );

    expect(abortRes.status).toBe(200);
    expect(await abortRes.json()).toEqual({ ok: true });
    expect(r2.pendingMultipartUploads).toBe(0);
    expect(r2.has(`files/${session.fileId}`)).toBe(false);
  });

  test("full CRUD lifecycle", async () => {
    const form = new FormData();
    form.set("file", new File(["data"], "lifecycle.txt", { type: "text/plain" }));
    form.set("tags", "alpha,beta");

    const createRes = await router.fetch(makeRequest("/api/files", { method: "POST", body: form }));
    expect(createRes.status).toBe(201);
    const { file } = (await createRes.json()) as {
      file: { id: string; name: string; tags: string[] };
    };
    expect(file.tags).toHaveLength(2);

    const listRes = await router.fetch(makeRequest("/api/files"));
    const { files } = (await listRes.json()) as { files: Array<{ id: string }> };
    expect(files).toHaveLength(1);
    expect(files[0].id).toBe(file.id);

    const updateRes = await router.fetch(
      makeRequest(`/api/files/${file.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "renamed.txt", isPublic: true }),
      }),
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as {
      file: { name: string; isPublic: boolean };
    };
    expect(updated.file.name).toBe("renamed.txt");
    expect(updated.file.isPublic).toBe(true);

    const downloadRes = await router.fetch(makeRequest(`/api/files/${file.id}/download`));
    expect(downloadRes.status).toBe(200);
    expect(await downloadRes.text()).toBe("data");

    const deleteRes = await router.fetch(
      makeRequest(`/api/files/${file.id}`, { method: "DELETE" }),
    );
    expect(deleteRes.status).toBe(200);
    const deleteBody = (await deleteRes.json()) as { ok: boolean };
    expect(deleteBody.ok).toBe(true);

    const afterDelete = await router.fetch(makeRequest("/api/files"));
    const { files: remaining } = (await afterDelete.json()) as { files: unknown[] };
    expect(remaining).toHaveLength(0);
  });

  test("GET /api/files/:id/download returns 404 for missing file", async () => {
    const res = await router.fetch(makeRequest("/api/files/nonexistent/download"));
    expect(res.status).toBe(404);
  });

  test("PATCH /api/files/:id returns 404 for missing file", async () => {
    const res = await router.fetch(
      makeRequest("/api/files/nonexistent", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "nope" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("PATCH /api/files/:id returns 400 for invalid body", async () => {
    const form = new FormData();
    form.set("file", new File(["x"], "f.txt", { type: "text/plain" }));
    const createRes = await router.fetch(makeRequest("/api/files", { method: "POST", body: form }));
    const { file } = (await createRes.json()) as { file: { id: string } };

    const res = await router.fetch(
      makeRequest(`/api/files/${file.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: 42 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("DELETE /api/files/:id returns 404 for missing file", async () => {
    const res = await router.fetch(makeRequest("/api/files/nonexistent", { method: "DELETE" }));
    expect(res.status).toBe(404);
  });

  test("GET /api/files with pagination", async () => {
    for (let i = 0; i < 3; i++) {
      const form = new FormData();
      form.set("file", new File([`content ${i}`], `file-${i}.txt`, { type: "text/plain" }));
      await router.fetch(makeRequest("/api/files", { method: "POST", body: form }));
    }

    const res = await router.fetch(makeRequest("/api/files?limit=2&offset=0"));
    const body = (await res.json()) as { files: unknown[]; nextOffset: number | null };
    expect(body.files).toHaveLength(2);
    expect(body.nextOffset).toBe(2);

    const page2 = await router.fetch(makeRequest("/api/files?limit=2&offset=2"));
    const body2 = (await page2.json()) as { files: unknown[]; nextOffset: number | null };
    expect(body2.files).toHaveLength(1);
    expect(body2.nextOffset).toBeNull();
  });
});

describe("tags API", () => {
  let db: D1Shim;
  let r2: R2Mock;
  let router: ReturnType<typeof createRouter>;

  beforeEach(() => {
    db = createTestD1();
    r2 = new R2Mock();
    router = createRouter(makeTestEnv(db, r2) as never);
  });

  test("GET /api/tags returns empty list", async () => {
    const res = await router.fetch(makeRequest("/api/tags"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tags: unknown[] };
    expect(body.tags).toEqual([]);
  });

  test("GET /api/tags returns tags from uploaded files", async () => {
    const form = new FormData();
    form.set("file", new File(["x"], "f.txt", { type: "text/plain" }));
    form.set("tags", "work,personal");
    await router.fetch(makeRequest("/api/files", { method: "POST", body: form }));

    const res = await router.fetch(makeRequest("/api/tags"));
    const body = (await res.json()) as { tags: Array<{ name: string; count: number }> };
    expect(body.tags).toHaveLength(2);
    const names = body.tags.map((t) => t.name).sort();
    expect(names).toEqual(["personal", "work"]);
  });
});

describe("public file routes", () => {
  let db: D1Shim;
  let r2: R2Mock;
  let router: ReturnType<typeof createRouter>;

  beforeEach(() => {
    db = createTestD1();
    r2 = new R2Mock();
    router = createRouter(makeTestEnv(db, r2) as never);
  });

  test("public file download works after publishing", async () => {
    const form = new FormData();
    form.set("file", new File(["public content"], "pub.txt", { type: "text/plain" }));
    const createRes = await router.fetch(makeRequest("/api/files", { method: "POST", body: form }));
    const { file } = (await createRes.json()) as { file: { id: string } };

    await router.fetch(
      makeRequest(`/api/files/${file.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPublic: true }),
      }),
    );

    const pubRes = await router.fetch(makeRequest(`/public/files/${file.id}/download`));
    expect(pubRes.status).toBe(200);
    expect(await pubRes.text()).toBe("public content");
  });

  test("unpublished file returns 404 on public route", async () => {
    const form = new FormData();
    form.set("file", new File(["private"], "priv.txt", { type: "text/plain" }));
    const createRes = await router.fetch(makeRequest("/api/files", { method: "POST", body: form }));
    const { file } = (await createRes.json()) as { file: { id: string } };

    const pubRes = await router.fetch(makeRequest(`/public/files/${file.id}/download`));
    expect(pubRes.status).toBe(404);
  });
});

describe("auth enforcement", () => {
  test("unauthenticated request to /api/files returns 401", async () => {
    const db = createTestD1();
    const r2 = new R2Mock();
    const env = makeTestEnv(db, r2);
    delete (env as Record<string, unknown>).DEV_AUTH_EMAIL;
    const router = createRouter(env as never);

    const res = await router.fetch(makeRequest("/api/files"));
    expect(res.status).toBe(401);
  });

  test("unauthenticated request to /api/tags returns 401", async () => {
    const db = createTestD1();
    const r2 = new R2Mock();
    const env = makeTestEnv(db, r2);
    delete (env as Record<string, unknown>).DEV_AUTH_EMAIL;
    const router = createRouter(env as never);

    const res = await router.fetch(makeRequest("/api/tags"));
    expect(res.status).toBe(401);
  });
});
