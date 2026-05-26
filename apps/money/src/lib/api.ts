/**
 * Simple REST API client for the money app.
 * Replaces the WebSocket sync protocol + TanStack DB with plain fetch + local state.
 */

const BASE = ""; // same-origin

export interface CommandResult {
  ok: true;
  data: Record<string, unknown>;
}

export interface CommandError {
  ok: false;
  error: string;
}

export type CommandResponse = CommandResult | CommandError;

export async function execute(commandType: string, payload: unknown): Promise<CommandResponse> {
  const res = await fetch(`${BASE}/api/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commandType, payload }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    return { ok: false, error: (body as any).error ?? "Request failed" };
  }
  return { ok: true, data: await res.json() };
}

export async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as T;
}
