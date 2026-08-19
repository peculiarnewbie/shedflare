import {
  isSyncCommandType,
  type ExternalValue,
  type JsonObject,
  type SyncCommandPayloadMap,
  type SyncCommandType,
} from "#/domain";
import { createStructuredLogger } from "#/effect";
import * as Schema from "effect/Schema";

export { json, isWebSocketRequest, nowIso } from "@shedflare/sync-protocol";

const JsonRecordSchema = Schema.Record(Schema.String, Schema.Any);

export function parseJsonRecord(value: string): JsonObject {
  try {
    const parsed = Schema.decodeUnknownSync(JsonRecordSchema)(JSON.parse(value));
    // SAFETY: JSON.parse limits values to JSON data and the schema verifies the object container.
    return parsed as JsonObject;
  } catch {
    return {};
  }
}

export function parseJsonRecords(value: string): JsonObject[] {
  try {
    const parsed = Schema.decodeUnknownSync(Schema.Array(JsonRecordSchema))(JSON.parse(value));
    // SAFETY: JSON.parse limits values to JSON data and the schema verifies every object container.
    return [...parsed] as JsonObject[];
  } catch {
    return [];
  }
}

export async function parseJsonRequest(request: Request) {
  try {
    return await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
}

export function parseInternalCommandBody(value: ExternalValue):
  | {
      opId: string;
      commandType: SyncCommandType;
      payload: SyncCommandPayloadMap[SyncCommandType];
    }
  | Response {
  let body;
  try {
    body = Schema.decodeUnknownSync(
      Schema.Struct({
        opId: Schema.NonEmptyString,
        commandType: Schema.String,
        payload: Schema.Any,
      }),
    )(value);
  } catch {
    return new Response("Expected JSON object", { status: 400 });
  }
  if (!isSyncCommandType(body.commandType)) {
    return new Response("Invalid commandType", { status: 400 });
  }
  return {
    opId: body.opId,
    commandType: body.commandType,
    // SAFETY: the command-specific schema validates this payload before command execution.
    payload: body.payload as SyncCommandPayloadMap[SyncCommandType],
  };
}

export function boolToSql(value: boolean | null | undefined) {
  if (value === undefined || value === null) return null;
  return value ? 1 : 0;
}

export function sqlToBool(value: ExternalValue) {
  return Boolean(Number(value));
}

export const syncLogger = createStructuredLogger("sync-do");

export function syncLog(message: string, details?: Parameters<typeof syncLogger.log>[1]) {
  syncLogger.log(message, details);
}

export function previewText(value: string, limit = 160) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function sanitizeGeneratedTitle(value: string) {
  const cleaned = value
    .replace(/^\s*["'`]+|["'`.!?:;\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 64).trim() || null;
}

export function looksLikeMissingRealtimeAccess(text: string) {
  return /don'?t have access to real[- ]?time|can'?t tell you the (exact )?current time|don'?t have access to the current date|don'?t have access to current information/i.test(
    text,
  );
}
