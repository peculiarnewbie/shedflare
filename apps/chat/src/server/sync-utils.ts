import { isSyncCommandType, type SyncCommandPayloadMap, type SyncCommandType } from "#/domain";
import { createStructuredLogger } from "#/effect";

export function json<T>(value: T) {
  return JSON.stringify(value);
}

export function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

export async function parseJsonRequest(request: Request) {
  try {
    return await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
}

export function parseInternalCommandBody(value: unknown):
  | {
      opId: string;
      commandType: SyncCommandType;
      payload: SyncCommandPayloadMap[SyncCommandType];
    }
  | Response {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Response("Expected JSON object", { status: 400 });
  }
  const body = value as Record<string, unknown>;
  if (typeof body.opId !== "string" || !body.opId.trim()) {
    return new Response("Invalid opId", { status: 400 });
  }
  if (!isSyncCommandType(body.commandType)) {
    return new Response("Invalid commandType", { status: 400 });
  }
  return {
    opId: body.opId,
    commandType: body.commandType,
    payload: body.payload as SyncCommandPayloadMap[SyncCommandType],
  };
}

export function boolToSql(value: boolean | null | undefined) {
  if (value === undefined || value === null) return null;
  return value ? 1 : 0;
}

export function sqlToBool(value: unknown) {
  return Boolean(Number(value));
}

export function isWebSocketRequest(request: Request) {
  return request.headers.get("upgrade")?.toLowerCase() === "websocket";
}

export function syncLog(message: string, details?: Record<string, unknown>) {
  syncLogger.log(message, details);
}

export const syncLogger = createStructuredLogger("sync-do");

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
