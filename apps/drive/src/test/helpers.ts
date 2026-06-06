import { createTestD1, type D1Shim } from "./d1-shim";
import { R2Mock, createR2Mock } from "./r2-mock";

export type TestEnv = {
  DB: D1Shim;
  FILES: R2Mock;
  AUTH_ISSUER_URL: string;
  AUTH_CLIENT_ID: string;
  APP_PUBLIC_URL: string;
  OWNER_EMAIL: string;
  DEV_AUTH_EMAIL: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export function createTestEnv(overrides?: Partial<TestEnv>): TestEnv {
  return {
    DB: createTestD1(),
    FILES: createR2Mock(),
    AUTH_ISSUER_URL: "https://auth.test.example.com",
    AUTH_CLIENT_ID: "shedflare-drive-test",
    APP_PUBLIC_URL: "https://drive.test.example.com",
    OWNER_EMAIL: "test@example.com",
    DEV_AUTH_EMAIL: "test@example.com",
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
    ...overrides,
  };
}

export function insertTestFile(
  db: D1Shim,
  overrides?: Partial<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    description: string;
    isPublic: boolean;
  }>,
) {
  const id = overrides?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  void db
    .prepare(
      `INSERT INTO files (id, object_key, name, mime_type, size, description, is_public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      `files/${id}`,
      overrides?.name ?? "test-file.txt",
      overrides?.mimeType ?? "text/plain",
      overrides?.size ?? 1024,
      overrides?.description ?? "",
      overrides?.isPublic ? 1 : 0,
      now,
      now,
    )
    .run();
  return id;
}

export function insertTestTag(db: D1Shim, name: string) {
  const id = crypto.randomUUID();
  const normalized = name.trim().toLowerCase().replaceAll(/\s+/g, " ");
  void db
    .prepare(`INSERT INTO tags (id, name, normalized_name) VALUES (?, ?, ?)`)
    .bind(id, name, normalized)
    .run();
  return id;
}

export function linkFileTag(db: D1Shim, fileId: string, tagId: string) {
  void db
    .prepare(`INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)`)
    .bind(fileId, tagId)
    .run();
}

export { R2Mock };
export type { D1Shim };
