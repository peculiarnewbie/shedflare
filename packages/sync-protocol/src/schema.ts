export const EVENTS_TABLE_DDL = `\
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  op_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_op_id ON events(op_id);
`;

export const COMMANDS_TABLE_DDL = `\
CREATE TABLE IF NOT EXISTS commands (
  op_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  response_json TEXT,
  acked_seq INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commands_acked_seq ON commands(acked_seq);
`;
