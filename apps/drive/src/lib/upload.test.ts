import { describe, expect, test } from "vite-plus/test";
import {
  CHUNKED_UPLOAD_THRESHOLD,
  DriveUploadError,
  uploadDriveFile,
  type UploadProgress,
} from "./upload";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function uploadedFile(size: number) {
  return {
    file: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "video.mp4",
      mimeType: "video/mp4",
      size,
      description: "archive",
      isPublic: false,
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
      tags: ["video"],
    },
  };
}

describe("uploadDriveFile", () => {
  test("chunks large files, retries a transient part failure, and reports progress", async () => {
    const fileSize = CHUNKED_UPLOAD_THRESHOLD + 1;
    const file = new File([new Uint8Array(fileSize)], "video.mp4", { type: "video/mp4" });
    const progress: UploadProgress[] = [];
    const partAttempts = new Map<number, number>();
    let completeBody: unknown = null;

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/files/multipart") {
        return jsonResponse(
          {
            fileId: "00000000-0000-4000-8000-000000000001",
            uploadId: "upload-1",
            partSize: CHUNKED_UPLOAD_THRESHOLD,
          },
          201,
        );
      }
      const partMatch = url.match(/\/parts\/(\d+)$/);
      if (partMatch) {
        const partNumber = Number(partMatch[1]);
        const attempt = (partAttempts.get(partNumber) ?? 0) + 1;
        partAttempts.set(partNumber, attempt);
        if (partNumber === 1 && attempt === 1) {
          return jsonResponse({ error: "Temporary storage issue", retryable: true }, 503);
        }
        return jsonResponse({ partNumber, etag: `etag-${partNumber}` });
      }
      if (url.endsWith("/complete")) {
        if (typeof init?.body !== "string") throw new Error("Expected JSON completion body");
        completeBody = JSON.parse(init.body);
        return jsonResponse(uploadedFile(fileSize), 201);
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await uploadDriveFile({
      file,
      description: "archive",
      tags: "video",
      signal: new AbortController().signal,
      onProgress: (value) => progress.push(value),
      fetchImpl,
    });

    expect(result.file.name).toBe("video.mp4");
    expect(partAttempts.get(1)).toBe(2);
    expect(partAttempts.get(2)).toBe(1);
    expect(completeBody).toMatchObject({
      uploadId: "upload-1",
      parts: [
        { partNumber: 1, etag: "etag-1" },
        { partNumber: 2, etag: "etag-2" },
      ],
    });
    expect(progress.at(-1)).toMatchObject({
      uploadedBytes: fileSize,
      percent: 100,
      completedParts: 2,
      totalParts: 2,
    });
  });

  test("preserves actionable server errors", async () => {
    const file = new File(["small"], "small.txt", { type: "text/plain" });
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(
        {
          code: "storage_write_failed",
          error: "Drive could not write the file to storage. Retry the upload.",
          retryable: true,
        },
        503,
      );

    const error = await uploadDriveFile({
      file,
      description: "",
      tags: "",
      signal: new AbortController().signal,
      onProgress: () => undefined,
      fetchImpl,
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(DriveUploadError);
    expect(error).toMatchObject({
      message: "Drive could not write the file to storage. Retry the upload.",
      status: 503,
      retryable: true,
    });
  });
});
