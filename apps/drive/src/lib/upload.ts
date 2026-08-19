import * as Schema from "effect/Schema";
import {
  FileResponse,
  MultipartPartResponse,
  MultipartUploadResponse,
  type FileResponse as FileResponseType,
  type MultipartPartResponse as MultipartPartResponseType,
  type MultipartUploadResponse as MultipartUploadResponseType,
} from "../types";

const MEBIBYTE = 1024 * 1024;
export const CHUNKED_UPLOAD_THRESHOLD = 10 * MEBIBYTE;
const PART_UPLOAD_CONCURRENCY = 3;
const PART_UPLOAD_ATTEMPTS = 3;

export type UploadProgress = {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  completedParts: number;
  totalParts: number;
};

export type UploadDriveFileOptions = {
  file: File;
  description: string;
  tags: string;
  signal: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
  fetchImpl?: typeof fetch;
};

export class DriveUploadError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status = 0, retryable = false) {
    super(message);
    this.name = "DriveUploadError";
    this.status = status;
    this.retryable = retryable;
  }
}

const ErrorResponse = Schema.Struct({
  error: Schema.String,
  retryable: Schema.optional(Schema.Boolean),
});

function errorMessageForStatus(status: number) {
  if (status === 401) return "Session expired — please sign in again.";
  if (status === 413) {
    return "The server rejected this upload as too large. Large files should use chunked upload; reload Drive and retry.";
  }
  if (status === 429) return "Drive is being rate limited. Wait a moment, then retry.";
  if (status >= 500) return `Drive could not store the file right now (HTTP ${status}). Retry.`;
  return `Upload failed (HTTP ${status}).`;
}

async function responseError(response: Response) {
  const text = await response.text().catch(() => "");
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  let decodedError: Schema.Schema.Type<typeof ErrorResponse> | null = null;
  try {
    decodedError = Schema.decodeUnknownSync(ErrorResponse)(body);
  } catch {
    // Fall through to the HTTP status and plain-text response.
  }
  const serverMessage = decodedError
    ? decodedError.error
    : text && !text.trimStart().startsWith("<")
      ? text.slice(0, 500)
      : "";
  const retryableFromBody = decodedError?.retryable ?? false;
  const retryable =
    retryableFromBody ||
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500;

  return new DriveUploadError(
    serverMessage || errorMessageForStatus(response.status),
    response.status,
    retryable,
  );
}

async function decodeResponse<SchemaType extends Parameters<typeof Schema.decodeUnknownSync>[0]>(
  response: Response,
  schema: SchemaType,
): Promise<SchemaType["Type"]> {
  if (!response.ok) throw await responseError(response);
  try {
    return Schema.decodeUnknownSync(schema)(await response.json());
  } catch {
    throw new DriveUploadError(
      "Drive returned an invalid upload response. Reload the app before retrying.",
      response.status,
    );
  }
}

function abortError() {
  return new DOMException("The upload was canceled.", "AbortError");
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(abortError());
    };
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function normalizeUploadError<ErrorValue>(error: ErrorValue) {
  if (error instanceof DriveUploadError || error instanceof DOMException) return error;
  if (error instanceof TypeError) {
    return new DriveUploadError(
      "The upload was interrupted. Check your connection and retry.",
      0,
      true,
    );
  }
  return new DriveUploadError("Upload failed unexpectedly. Retry the file.");
}

async function uploadPartWithRetry(options: {
  fetchImpl: typeof fetch;
  session: MultipartUploadResponseType;
  file: File;
  partIndex: number;
  signal: AbortSignal;
}) {
  const { fetchImpl, session, file, partIndex, signal } = options;
  const partNumber = partIndex + 1;
  const start = partIndex * session.partSize;
  const chunk = file.slice(start, Math.min(start + session.partSize, file.size));

  for (let attempt = 1; attempt <= PART_UPLOAD_ATTEMPTS; attempt++) {
    if (signal.aborted) throw abortError();
    try {
      const response = await fetchImpl(
        `/api/files/multipart/${encodeURIComponent(session.fileId)}/parts/${partNumber}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            "x-shedflare-upload-id": session.uploadId,
          },
          body: chunk,
          signal,
        },
      );
      return await decodeResponse(response, MultipartPartResponse);
    } catch (error) {
      const normalized = normalizeUploadError(error);
      if (
        normalized instanceof DOMException ||
        !(normalized instanceof DriveUploadError) ||
        !normalized.retryable ||
        attempt === PART_UPLOAD_ATTEMPTS
      ) {
        throw normalized;
      }
      await waitForRetry(400 * 2 ** (attempt - 1), signal);
    }
  }

  throw new DriveUploadError(`Upload part ${partNumber} failed.`);
}

async function abortMultipartUpload(fetchImpl: typeof fetch, session: MultipartUploadResponseType) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 3_000);
  try {
    await fetchImpl(`/api/files/multipart/${encodeURIComponent(session.fileId)}`, {
      method: "DELETE",
      headers: { "x-shedflare-upload-id": session.uploadId },
      signal: controller.signal,
    });
  } catch {
    // R2 also expires incomplete multipart uploads automatically.
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function uploadChunked(options: UploadDriveFileOptions): Promise<FileResponseType> {
  const { file, description, tags, signal, onProgress } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const metadata = {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    description,
    tags,
  };
  let session: MultipartUploadResponseType | null = null;

  try {
    const createResponse = await fetchImpl("/api/files/multipart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metadata),
      signal,
    });
    session = await decodeResponse(createResponse, MultipartUploadResponse);

    const activeSession = session;
    const totalParts = Math.max(1, Math.ceil(file.size / activeSession.partSize));
    const parts: Array<MultipartPartResponseType | undefined> = Array.from({
      length: totalParts,
    });
    const sessionController = new AbortController();
    const cancelSession = () => sessionController.abort();
    signal.addEventListener("abort", cancelSession, { once: true });
    let nextPartIndex = 0;
    let uploadedBytes = 0;
    let completedParts = 0;

    try {
      const workers = Array.from(
        { length: Math.min(PART_UPLOAD_CONCURRENCY, totalParts) },
        async () => {
          while (!sessionController.signal.aborted) {
            const partIndex = nextPartIndex++;
            if (partIndex >= totalParts) return;
            const part = await uploadPartWithRetry({
              fetchImpl,
              session: activeSession,
              file,
              partIndex,
              signal: sessionController.signal,
            });
            parts[partIndex] = part;
            completedParts++;
            uploadedBytes += Math.min(
              activeSession.partSize,
              Math.max(0, file.size - partIndex * activeSession.partSize),
            );
            onProgress({
              uploadedBytes,
              totalBytes: file.size,
              percent:
                file.size === 0 ? 100 : Math.min(99, Math.round((uploadedBytes / file.size) * 100)),
              completedParts,
              totalParts,
            });
          }
        },
      );
      await Promise.all(workers);
      if (signal.aborted) throw abortError();
    } catch (error) {
      sessionController.abort();
      throw error;
    } finally {
      signal.removeEventListener("abort", cancelSession);
    }

    const completedPartList = parts.filter(
      (part): part is MultipartPartResponseType => part !== undefined,
    );
    if (completedPartList.length !== totalParts) {
      throw new DriveUploadError("The upload stopped before all parts were stored.", 0, true);
    }

    const completeResponse = await fetchImpl(
      `/api/files/multipart/${encodeURIComponent(session.fileId)}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...metadata, uploadId: session.uploadId, parts: completedPartList }),
        signal,
      },
    );
    const result = await decodeResponse(completeResponse, FileResponse);
    onProgress({
      uploadedBytes: file.size,
      totalBytes: file.size,
      percent: 100,
      completedParts: totalParts,
      totalParts,
    });
    return result;
  } catch (error) {
    if (session) await abortMultipartUpload(fetchImpl, session);
    throw normalizeUploadError(error);
  }
}

async function uploadSingle(options: UploadDriveFileOptions): Promise<FileResponseType> {
  const { file, description, tags, signal, onProgress } = options;
  const data = new FormData();
  data.set("file", file);
  data.set("description", description);
  data.set("tags", tags);

  try {
    const response = await (options.fetchImpl ?? fetch)("/api/files", {
      method: "POST",
      body: data,
      signal,
    });
    const result = await decodeResponse(response, FileResponse);
    onProgress({
      uploadedBytes: file.size,
      totalBytes: file.size,
      percent: 100,
      completedParts: 1,
      totalParts: 1,
    });
    return result;
  } catch (error) {
    throw normalizeUploadError(error);
  }
}

export function uploadDriveFile(options: UploadDriveFileOptions) {
  options.onProgress({
    uploadedBytes: 0,
    totalBytes: options.file.size,
    percent: 0,
    completedParts: 0,
    totalParts: options.file.size > CHUNKED_UPLOAD_THRESHOLD ? 0 : 1,
  });
  return options.file.size > CHUNKED_UPLOAD_THRESHOLD
    ? uploadChunked(options)
    : uploadSingle(options);
}
