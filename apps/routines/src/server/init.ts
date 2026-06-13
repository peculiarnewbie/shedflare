/**
 * Idempotent schema bootstrap. Runs `CREATE TABLE IF NOT EXISTS` on the bound
 * D1 so a fresh database (local miniflare in dev, or a newly provisioned remote
 * D1) has the tables without a separate migration step. Kept in sync with
 * `src/db/schema.ts` and `src/migrations/`.
 */
const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS settings (
    id text PRIMARY KEY,
    key text NOT NULL UNIQUE,
    value text NOT NULL,
    updated_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS routines (
    id text PRIMARY KEY,
    name text NOT NULL,
    color text DEFAULT '#5b8def' NOT NULL,
    duration_minutes integer NOT NULL,
    weekly_target integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS routine_completions (
    id text PRIMARY KEY,
    routine_id text NOT NULL,
    date text NOT NULL,
    completed integer DEFAULT 0 NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    UNIQUE(routine_id, date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_routines_sort_order ON routines (sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_routine_completions_date ON routine_completions (date)`,
  `CREATE INDEX IF NOT EXISTS idx_routine_completions_routine_date ON routine_completions (routine_id, date)`,
];

/** Idempotent column additions for databases created before a column existed. */
const ALTERS: string[] = [
  `ALTER TABLE routines ADD COLUMN color text DEFAULT '#5b8def' NOT NULL`,
  `ALTER TABLE routines ADD COLUMN weekly_target integer DEFAULT 0 NOT NULL`,
];

let ready: Promise<void> | null = null;

export function ensureSchema(d1: D1Database): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const stmt of DDL) {
        await d1.prepare(stmt).run();
      }
      for (const stmt of ALTERS) {
        // Ignore "duplicate column" — the ALTER is a no-op once applied.
        await d1
          .prepare(stmt)
          .run()
          .catch(() => {});
      }
    })().catch((err) => {
      // Reset so a later request can retry if the first attempt failed.
      ready = null;
      throw err;
    });
  }
  return ready;
}
