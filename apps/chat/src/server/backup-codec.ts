import { decodeSyncSnapshot, type ExternalValue } from "#/domain";
import type { ModelMessage, TokenUsage } from "@tanstack/ai";
import * as Schema from "effect/Schema";
import type { ChatAiBackup, ChatBackup } from "./backup-reader";

const NullableString = Schema.NullOr(Schema.String);
const NullableNumber = Schema.NullOr(Schema.Number);

const BackupEventSchema = Schema.Struct({
  seq: Schema.Number,
  eventId: Schema.String,
  opId: NullableString,
  type: Schema.String,
  payloadJson: Schema.String,
  createdAt: Schema.String,
});
const BackupCommandSchema = Schema.Struct({
  opId: Schema.String,
  type: Schema.String,
  status: Schema.String,
  responseJson: NullableString,
  createdAt: Schema.String,
  ackedSeq: NullableNumber,
});
const AiThreadSchema = Schema.Struct({
  threadId: Schema.String,
  messagesJson: Schema.Array(Schema.Any),
  updatedAt: Schema.Number,
});
const AiRunSchema = Schema.Struct({
  runId: Schema.String,
  threadId: Schema.String,
  status: Schema.Literals(["running", "interrupted", "completed", "failed", "aborted"]),
  startedAt: Schema.Number,
  finishedAt: NullableNumber,
  error: NullableString,
  errorCode: NullableString,
  usageJson: Schema.NullOr(Schema.Any),
  sandboxKey: NullableString,
  detachedSince: NullableNumber,
  cancelRequested: Schema.NullOr(Schema.Boolean),
  driverEpoch: NullableNumber,
});
const AiInterruptSchema = Schema.Struct({
  interruptId: Schema.String,
  runId: Schema.String,
  threadId: Schema.String,
  status: Schema.Literals(["pending", "resolved", "cancelled"]),
  requestedAt: Schema.Number,
  resolvedAt: NullableNumber,
  payloadJson: Schema.Record(Schema.String, Schema.Any),
  responseJson: Schema.NullOr(Schema.Any),
});
const AiMetadataSchema = Schema.Struct({
  namespace: Schema.String,
  key: Schema.String,
  valueJson: Schema.Any,
});
const AiBackupSchema = Schema.Struct({
  threads: Schema.Array(AiThreadSchema),
  runs: Schema.Array(AiRunSchema),
  interrupts: Schema.Array(AiInterruptSchema),
  metadata: Schema.Array(AiMetadataSchema),
});
const BackupBaseFields = {
  app: Schema.Literal("chat"),
  createdAt: Schema.String,
  protocolVersion: Schema.String,
  serverSeq: Schema.Number,
  snapshot: Schema.Any,
  events: Schema.Array(BackupEventSchema),
  commands: Schema.Array(BackupCommandSchema),
} as const;
const ChatBackupWireSchema = Schema.Union([
  Schema.Struct({ version: Schema.Literal(1), ...BackupBaseFields }),
  Schema.Struct({ version: Schema.Literal(2), ...BackupBaseFields, ai: AiBackupSchema }),
]);

export function decodeChatBackup(value: ExternalValue): ChatBackup {
  const decoded = Schema.decodeUnknownSync(ChatBackupWireSchema)(value);
  const snapshot = decodeSyncSnapshot(decoded.snapshot);
  if (!snapshot) throw new Error("Backup contains an invalid sync snapshot.");
  const base = {
    app: decoded.app,
    createdAt: decoded.createdAt,
    protocolVersion: decoded.protocolVersion,
    serverSeq: decoded.serverSeq,
    snapshot,
    events: [...decoded.events],
    commands: [...decoded.commands],
  };
  if (decoded.version === 1) return { version: 1, ...base };

  const ai: ChatAiBackup = {
    threads: decoded.ai.threads.map((row) => ({
      ...row,
      // SAFETY: only owner-authenticated, app-produced R2 backups reach this
      // decoder; TanStack validates message shapes when it consumes them.
      messagesJson: [...row.messagesJson] as ModelMessage[],
    })),
    runs: decoded.ai.runs.map((row) => ({
      ...row,
      // SAFETY: AiRunSchema decoded the canonical fields; app-produced backups own optional provider detail fields.
      usageJson: row.usageJson as TokenUsage | null,
    })),
    interrupts: decoded.ai.interrupts.map((row) => ({
      ...row,
      payloadJson: { ...row.payloadJson },
    })),
    metadata: decoded.ai.metadata.map((row) => ({ ...row })),
  };
  return { version: 2, ...base, ai };
}
