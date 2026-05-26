/**
 * Compatibility stub — replaces the old WebSocket-based dispatch.
 * Uses the new REST API under the hood.
 */

import { execute } from "./api";

export function dispatch(
  commandType: string,
  payload: unknown,
  options?: { opId?: string; undoInfo?: any },
): { opId: string; promise: Promise<void> } {
  const opId = options?.opId ?? `op_${crypto.randomUUID().slice(0, 8)}`;
  // ignore undoInfo for now — undo is simplified in D1 migration
  const promise = execute(commandType, payload).then((result) => {
    if (!result.ok) throw new Error(result.error);
  });
  return { opId, promise };
}
