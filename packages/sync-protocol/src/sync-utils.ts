import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SyncDecodeError } from "./errors";
import { SyncClientEnvelopeSchema } from "./sync-types";

export function json<Value>(value: Value): string {
  return JSON.stringify(value);
}

export function decodeSyncClientEnvelope(text: string) {
  return Effect.try({
    try: () => JSON.parse(text),
    catch: (cause) => new SyncDecodeError({ target: "clientEnvelope", cause }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(SyncClientEnvelopeSchema)),
    Effect.mapError((cause) =>
      cause instanceof SyncDecodeError
        ? cause
        : new SyncDecodeError({ target: "clientEnvelope", cause }),
    ),
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isWebSocketRequest(request: Request): boolean {
  const upgrade = request.headers.get("Upgrade");
  return upgrade !== null && upgrade.toLowerCase() === "websocket";
}

export function createId(prefix: string): string {
  const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `${prefix}_${hex}`;
}
