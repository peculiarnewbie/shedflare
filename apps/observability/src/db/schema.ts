export interface ErrorLog {
  id: string;
  outcome: string;
  scriptName: string;
  method: string | null;
  url: string | null;
  status: number | null;
  exceptionName: string | null;
  exceptionMessage: string | null;
  stack: string | null;
  cpuTimeUs: number | null;
  createdAt: string;
}

const CREATE_ERROR_LOGS = `CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,
  outcome TEXT NOT NULL,
  script_name TEXT NOT NULL,
  method TEXT,
  url TEXT,
  status INTEGER,
  exception_name TEXT,
  exception_message TEXT,
  stack TEXT,
  cpu_time_us INTEGER,
  created_at TEXT NOT NULL
)`;

export function initializeStorage(db: D1Database): Promise<void> {
  return db.exec(CREATE_ERROR_LOGS);
}
