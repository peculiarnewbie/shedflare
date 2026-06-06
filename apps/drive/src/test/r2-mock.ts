export class R2Mock {
  private store = new Map<
    string,
    { body: Uint8Array; httpMetadata: Record<string, string>; size: number }
  >();

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: { httpMetadata?: Record<string, string> },
  ): Promise<null> {
    let body: Uint8Array;
    if (typeof value === "string") {
      body = new TextEncoder().encode(value);
    } else if (value instanceof ArrayBuffer) {
      body = new Uint8Array(value);
    } else if (value instanceof ReadableStream) {
      const chunks: Uint8Array[] = [];
      const reader = value.getReader();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        chunks.push(chunk);
      }
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      body = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    } else {
      body = new Uint8Array();
    }

    this.store.set(key, {
      body,
      httpMetadata: options?.httpMetadata ?? {},
      size: body.length,
    });
    return null;
  }

  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;

    return {
      body: new Response(entry.body as unknown as BodyInit).body!,
      size: entry.size,
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
}

export function createR2Mock(): R2Mock {
  return new R2Mock();
}
