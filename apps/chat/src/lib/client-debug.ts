import type { JsonObject } from "#/domain";

const DEBUG_STORAGE_KEY = "shedflare.chat.debug";

export function isChatDebugEnabled() {
  if (!globalThis.window) return false;

  try {
    return (
      new URLSearchParams(window.location.search).get("debug") === "1" ||
      window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

/**
 * Chat diagnostics are opt-in. The sync path is hot enough that a normal
 * session should not write a console entry for every event or timer tick.
 */
export function debugLog(scope: string, event: string, details?: JsonObject) {
  if (!isChatDebugEnabled()) return;
  if (details) {
    console.debug(`[${scope}] ${event}`, details);
    return;
  }
  console.debug(`[${scope}] ${event}`);
}
