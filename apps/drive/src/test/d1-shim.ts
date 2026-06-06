import { DatabaseSync } from "node:sqlite";

export class D1Shim {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    return {
      bind: (...params: unknown[]) => ({
        all: async () => {
          const results = stmt.all(...(params as never[]));
          return { results };
        },
        first: async () => {
          const rows = stmt.all(...(params as never[]));
          return rows[0] ?? null;
        },
        run: async () => {
          const result = stmt.run(...(params as never[]));
          return { changes: result.changes, lastRowId: result.lastInsertRowid };
        },
        raw: async () => {
          const rows = stmt.all(...(params as never[]));
          return rows.map((row) => Object.values(row as Record<string, unknown>));
        },
      }),
      all: async () => {
        const results = stmt.all();
        return { results };
      },
      first: async () => {
        const rows = stmt.all();
        return rows[0] ?? null;
      },
      run: async () => {
        const result = stmt.run();
        return { changes: result.changes, lastRowId: result.lastInsertRowid };
      },
      raw: async () => {
        const rows = stmt.all();
        return rows.map((row) => Object.values(row as Record<string, unknown>));
      },
    };
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  batch(statements: Array<{ bind: (...args: unknown[]) => unknown }>) {
    return statements.map((s) => s);
  }
}

export function createD1Shim(): D1Shim {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return new D1Shim(db);
}

export function createTestD1(): D1Shim {
  const d1 = createD1Shim();
  d1.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      object_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      description TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  d1.exec(`CREATE INDEX IF NOT EXISTS idx_files_created_at ON files (created_at)`);
  d1.exec(`CREATE INDEX IF NOT EXISTS idx_files_name ON files (name)`);
  d1.exec(
    `CREATE INDEX IF NOT EXISTS idx_files_is_public_created_at ON files (is_public, created_at)`,
  );

  d1.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL
    )
  `);
  d1.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_normalized_name ON tags (normalized_name)`);

  d1.exec(`
    CREATE TABLE IF NOT EXISTS file_tags (
      file_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      CONSTRAINT file_tags_pk PRIMARY KEY(file_id, tag_id),
      CONSTRAINT fk_file_tags_file_id_files_id_fk FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      CONSTRAINT fk_file_tags_tag_id_tags_id_fk FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  return d1;
}
