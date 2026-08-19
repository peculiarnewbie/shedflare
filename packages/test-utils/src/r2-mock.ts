type R2MockBody = ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob;

async function readBody(value: R2MockBody): Promise<Uint8Array> {
  if (!(value instanceof Object)) return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());

  const chunks: Uint8Array[] = [];
  const reader = value.getReader();
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    chunks.push(chunk);
  }
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

export class R2Mock {
  private store = new Map<
    string,
    { body: Uint8Array; httpMetadata: Record<string, string>; size: number }
  >();
  private multipartUploads = new Map<
    string,
    {
      key: string;
      httpMetadata: Record<string, string>;
      parts: Map<number, { body: Uint8Array; etag: string }>;
    }
  >();

  async put(
    key: string,
    value: R2MockBody,
    options?: { httpMetadata?: Record<string, string> },
  ): Promise<null> {
    const body = await readBody(value);

    this.store.set(key, {
      body,
      httpMetadata: options?.httpMetadata ?? {},
      size: body.length,
    });
    return null;
  }

  async createMultipartUpload(key: string, options?: { httpMetadata?: Record<string, string> }) {
    const uploadId = crypto.randomUUID();
    this.multipartUploads.set(uploadId, {
      key,
      httpMetadata: options?.httpMetadata ?? {},
      parts: new Map(),
    });
    return this.multipartHandle(key, uploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string) {
    return this.multipartHandle(key, uploadId);
  }

  private multipartHandle(key: string, uploadId: string) {
    return {
      key,
      uploadId,
      uploadPart: async (partNumber: number, value: R2MockBody) => {
        const upload = this.multipartUploads.get(uploadId);
        if (!upload || upload.key !== key) throw new Error("Multipart upload not found");
        const body = await readBody(value);
        const etag = `mock-${partNumber}-${body.length}`;
        upload.parts.set(partNumber, { body, etag });
        return { partNumber, etag };
      },
      abort: async () => {
        const upload = this.multipartUploads.get(uploadId);
        if (!upload || upload.key !== key) throw new Error("Multipart upload not found");
        this.multipartUploads.delete(uploadId);
      },
      complete: async (parts: Array<{ partNumber: number; etag: string }>) => {
        const upload = this.multipartUploads.get(uploadId);
        if (!upload || upload.key !== key) throw new Error("Multipart upload not found");

        const storedParts = parts.map((part) => {
          const stored = upload.parts.get(part.partNumber);
          if (!stored || stored.etag !== part.etag) throw new Error("Multipart part not found");
          return stored.body;
        });
        const size = storedParts.reduce((sum, part) => sum + part.length, 0);
        const body = new Uint8Array(size);
        let offset = 0;
        for (const part of storedParts) {
          body.set(part, offset);
          offset += part.length;
        }
        this.store.set(key, { body, httpMetadata: upload.httpMetadata, size });
        this.multipartUploads.delete(uploadId);
        return { size };
      },
    };
  }

  async get(
    key: string,
    options?: { range?: { offset?: number; length?: number; suffix?: number } },
  ) {
    const entry = this.store.get(key);
    if (!entry) return null;

    const requestedRange = options?.range;
    const offset = requestedRange?.suffix
      ? Math.max(0, entry.size - requestedRange.suffix)
      : (requestedRange?.offset ?? 0);
    const length = Math.min(
      requestedRange?.suffix ?? requestedRange?.length ?? entry.size - offset,
      entry.size - offset,
    );
    const body = requestedRange ? entry.body.slice(offset, offset + length) : entry.body;

    const responseBuffer = new ArrayBuffer(body.byteLength);
    new Uint8Array(responseBuffer).set(body);
    return {
      body: new Response(responseBuffer).body!,
      size: entry.size,
      range: requestedRange ? { offset, length } : undefined,
      writeHttpMetadata: (headers: Headers) => {
        for (const [k, v] of Object.entries(entry.httpMetadata)) {
          headers.set(k, v);
        }
      },
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  get size() {
    return this.store.size;
  }

  has(key: string) {
    return this.store.has(key);
  }

  get pendingMultipartUploads() {
    return this.multipartUploads.size;
  }
}

export function createR2Mock(): R2Mock {
  return new R2Mock();
}

export function asR2Bucket(mock: R2Mock): R2Bucket {
  // SAFETY: R2Mock implements the R2 methods and result shapes exercised by application tests.
  return mock as R2Mock & R2Bucket;
}
