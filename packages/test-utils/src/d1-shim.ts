import { DatabaseSync, type SQLInputValue } from "node:sqlite";

function asSqlInputValues(params: ReadonlyArray<unknown>): SQLInputValue[] {
  // SAFETY: D1 and node:sqlite share the scalar binding types used by these test databases.
  return params as SQLInputValue[];
}

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
          const results = stmt.all(...asSqlInputValues(params));
          return { results };
        },
        first: async () => {
          const rows = stmt.all(...asSqlInputValues(params));
          return rows[0] ?? null;
        },
        run: async () => {
          const result = stmt.run(...asSqlInputValues(params));
          return { changes: result.changes, lastRowId: result.lastInsertRowid };
        },
        raw: async () => {
          const rows = stmt.all(...asSqlInputValues(params));
          return rows.map((row) => Object.values(row));
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
        return rows.map((row) => Object.values(row));
      },
    };
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  batch<Statement>(statements: ReadonlyArray<Statement>): Statement[] {
    return [...statements];
  }
}

export function createD1Shim(): D1Shim {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return new D1Shim(db);
}

export function asD1Database(shim: D1Shim): D1Database {
  // SAFETY: D1Shim implements the D1 prepare/exec/batch contract used by Drizzle in tests.
  return shim as D1Shim & D1Database;
}
