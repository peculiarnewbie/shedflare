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
