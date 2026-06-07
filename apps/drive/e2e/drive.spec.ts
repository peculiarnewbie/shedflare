import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const authEmail = process.env.E2E_AUTH_EMAIL ?? "test@example.com";

async function uploadFile(
  page: Page,
  context: BrowserContext,
  opts: { name: string; body: string; description?: string; tags?: string },
) {
  const uploadPromise = page.waitForResponse(
    (resp) => resp.url().includes("/api/files") && resp.request().method() === "POST",
  );
  await page.locator('input[name="file"]').setInputFiles({
    name: opts.name,
    mimeType: "text/plain",
    buffer: Buffer.from(opts.body),
  });
  const resp = await uploadPromise;
  expect(resp.status()).toBe(201);
  const body = (await resp.json()) as { file: { id: string } };
  return body.file.id;
}

test.describe("Drive E2E", () => {
  test("full file lifecycle", async ({ page, context }) => {
    const ts = Date.now();
    const fileName = `e2e-lifecycle-${ts}.txt`;
    const fileBody = `Lifecycle test ${ts}`;

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".file-card, .empty-state")).toBeVisible({ timeout: 15_000 });

    // Upload
    const fileId = await uploadFile(page, context, { name: fileName, body: fileBody });
    await expect(page.getByText(fileName)).toBeVisible({ timeout: 20_000 });

    // Verify in API
    const listResp = await context.request.get("/api/files?limit=100&offset=0");
    expect(listResp.status()).toBe(200);
    const listBody = (await listResp.json()) as { files: Array<{ id: string; name: string }> };
    expect(listBody.files.find((f) => f.id === fileId)).toBeDefined();

    // Download
    const dlResp = await context.request.get(`/api/files/${fileId}/download`);
    expect(dlResp.status()).toBe(200);
    expect(await dlResp.text()).toBe(fileBody);

    // Make public
    const pubResp = await context.request.patch(`/api/files/${fileId}`, {
      data: { isPublic: true },
    });
    expect(pubResp.status()).toBe(200);
    const pubBody = (await pubResp.json()) as { file: { isPublic: boolean } };
    expect(pubBody.file.isPublic).toBe(true);

    // Public download (no auth)
    const publicDl = await context.request.get(`/public/files/${fileId}/download`);
    expect(publicDl.status()).toBe(200);
    expect(await publicDl.text()).toBe(fileBody);

    // Make private again
    const privResp = await context.request.patch(`/api/files/${fileId}`, {
      data: { isPublic: false },
    });
    expect(privResp.status()).toBe(200);

    // Public download should 404 now
    const pub404 = await context.request.get(`/public/files/${fileId}/download`);
    expect(pub404.status()).toBe(404);

    // Delete
    const delResp = await context.request.delete(`/api/files/${fileId}`);
    expect(delResp.status()).toBe(200);

    // Verify deleted
    const dl404 = await context.request.get(`/api/files/${fileId}/download`);
    expect(dl404.status()).toBe(404);
  });

  test("upload with tags and description", async ({ page, context }) => {
    const ts = Date.now();
    const fileName = `e2e-tags-${ts}.txt`;

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".file-card, .empty-state")).toBeVisible({ timeout: 15_000 });

    // Fill in tags and description before upload
    await page.locator('input[placeholder*="tags"]').fill("e2e, automated");
    await page.locator('input[placeholder*="note"]').fill("Created by e2e test");

    await uploadFile(page, context, { name: fileName, body: "tagged file" });
    await expect(page.getByText(fileName)).toBeVisible({ timeout: 20_000 });

    // Verify tags via API
    const listResp = await context.request.get("/api/files?limit=100&offset=0");
    const listBody = (await listResp.json()) as {
      files: Array<{ id: string; name: string; tags: string[]; description: string }>;
    };
    const uploaded = listBody.files.find((f) => f.name === fileName);
    expect(uploaded).toBeDefined();
    expect(uploaded!.tags).toContain("e2e");
    expect(uploaded!.tags).toContain("automated");
    expect(uploaded!.description).toBe("Created by e2e test");

    // Cleanup
    await context.request.delete(`/api/files/${uploaded!.id}`);
  });

  test("rename file via API", async ({ page, context }) => {
    const ts = Date.now();
    const origName = `e2e-rename-${ts}.txt`;
    const newName = `e2e-renamed-${ts}.txt`;

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".file-card, .empty-state")).toBeVisible({ timeout: 15_000 });

    const fileId = await uploadFile(page, context, { name: origName, body: "rename me" });
    await expect(page.getByText(origName)).toBeVisible({ timeout: 20_000 });

    // Rename via API
    const patchResp = await context.request.patch(`/api/files/${fileId}`, {
      data: { name: newName },
    });
    expect(patchResp.status()).toBe(200);
    const patchBody = (await patchResp.json()) as { file: { name: string } };
    expect(patchBody.file.name).toBe(newName);

    // Verify new name in UI
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(newName)).toBeVisible({ timeout: 15_000 });

    // Cleanup
    await context.request.delete(`/api/files/${fileId}`);
  });

  test("search files", async ({ page, context }) => {
    const ts = Date.now();
    const uniqueName = `e2e-searchable-${ts}.txt`;

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".file-card, .empty-state")).toBeVisible({ timeout: 15_000 });

    const fileId = await uploadFile(page, context, { name: uniqueName, body: "searchable" });
    await expect(page.getByRole("heading", { name: uniqueName })).toBeVisible({ timeout: 20_000 });

    // Dismiss toast
    await page.waitForTimeout(1000);

    // Search via UI
    await page.locator('input[placeholder*="Search"]').fill(`searchable-${ts}`);
    await expect(page.getByRole("heading", { name: uniqueName })).toBeVisible({ timeout: 10_000 });

    // Search for non-existent
    await page.locator('input[placeholder*="Search"]').fill(`nonexistent-${ts}`);
    await expect(page.getByRole("heading", { name: uniqueName })).not.toBeVisible({
      timeout: 10_000,
    });

    // Clear search
    await page.locator('input[placeholder*="Search"]').fill("");
    await expect(page.getByRole("heading", { name: uniqueName })).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await context.request.delete(`/api/files/${fileId}`);
  });

  test("delete file via UI", async ({ page, context }) => {
    const ts = Date.now();
    const fileName = `e2e-delete-ui-${ts}.txt`;

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".file-card, .empty-state")).toBeVisible({ timeout: 15_000 });

    const fileId = await uploadFile(page, context, { name: fileName, body: "delete me" });
    await expect(page.getByRole("heading", { name: fileName })).toBeVisible({ timeout: 20_000 });

    // Click the file card article
    await page.locator(`.file-card:has-text("${fileName}")`).click();

    // Wait for detail panel
    await expect(page.locator(".right-sidebar.open")).toBeVisible({ timeout: 5_000 });

    // Click Delete button
    await page.locator(".detail-actions .btn-danger").click();

    // Confirm deletion in modal
    await expect(page.locator(".delete-modal")).toBeVisible({ timeout: 5_000 });
    await page.locator(".delete-modal .btn-danger").click();

    // Verify file is gone from the grid
    await expect(page.locator(`.file-card:has-text("${fileName}")`)).not.toBeVisible({
      timeout: 10_000,
    });

    // Verify via API
    const dlResp = await context.request.get(`/api/files/${fileId}/download`);
    expect(dlResp.status()).toBe(404);
  });

  test("toggle public/private via UI", async ({ page, context }) => {
    const ts = Date.now();
    const fileName = `e2e-public-ui-${ts}.txt`;

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".file-card, .empty-state")).toBeVisible({ timeout: 15_000 });

    const fileId = await uploadFile(page, context, { name: fileName, body: "public toggle" });
    await expect(page.getByText(fileName)).toBeVisible({ timeout: 20_000 });

    // Click file card to open details
    await page.locator(`.file-card:has-text("${fileName}")`).click();

    // Wait for detail panel
    await expect(page.locator(".right-sidebar.open")).toBeVisible({ timeout: 5_000 });

    // Make public
    await page.locator('.detail-actions button:has-text("Make public")').click();
    await expect(page.locator(".share-state.public")).toBeVisible({ timeout: 5_000 });

    // Make private
    await page.locator('.detail-actions button:has-text("Make private")').click();
    await expect(page.locator(".share-state:not(.public)")).toBeVisible({ timeout: 5_000 });

    // Cleanup
    await context.request.delete(`/api/files/${fileId}`);
  });

  test("tags API", async ({ page, context }) => {
    const ts = Date.now();

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".file-card, .empty-state")).toBeVisible({ timeout: 15_000 });

    // Upload a file with tags
    await page.locator('input[placeholder*="tags"]').fill(`tagapi-${ts}`);
    const fileId = await uploadFile(page, context, {
      name: `e2e-tagapi-${ts}.txt`,
      body: "tag api test",
    });

    // Verify tags endpoint
    const tagsResp = await context.request.get("/api/tags");
    expect(tagsResp.status()).toBe(200);
    const tagsBody = (await tagsResp.json()) as { tags: Array<{ name: string; count: number }> };
    expect(tagsBody.tags.find((t) => t.name === `tagapi-${ts}`)).toBeDefined();

    // Cleanup
    await context.request.delete(`/api/files/${fileId}`);
  });

  test("public files listing", async ({ page, context }) => {
    const ts = Date.now();
    const fileName = `e2e-public-list-${ts}.txt`;

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".file-card, .empty-state")).toBeVisible({ timeout: 15_000 });

    const fileId = await uploadFile(page, context, { name: fileName, body: "public listing" });

    // Make public
    await context.request.patch(`/api/files/${fileId}`, { data: { isPublic: true } });

    // Check public files listing (no auth)
    const pubListResp = await context.request.get("/api/public/files");
    expect(pubListResp.status()).toBe(200);
    const pubListBody = (await pubListResp.json()) as {
      files: Array<{ id: string; name: string }>;
    };
    expect(pubListBody.files.find((f) => f.id === fileId)).toBeDefined();

    // Cleanup
    await context.request.delete(`/api/files/${fileId}`);
  });

  test("public file preview", async ({ page, context }) => {
    const ts = Date.now();
    const fileName = `e2e-preview-${ts}.txt`;

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".file-card, .empty-state")).toBeVisible({ timeout: 15_000 });

    const fileId = await uploadFile(page, context, { name: fileName, body: "preview content" });

    // Make public
    await context.request.patch(`/api/files/${fileId}`, { data: { isPublic: true } });

    // Preview (inline, no auth)
    const previewResp = await context.request.get(`/public/files/${fileId}/preview`);
    expect(previewResp.status()).toBe(200);
    expect(await previewResp.text()).toBe("preview content");

    // Cleanup
    await context.request.delete(`/api/files/${fileId}`);
  });
});
