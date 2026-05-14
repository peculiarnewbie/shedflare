export function json(value: unknown): string {
  return JSON.stringify(value);
}

export function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
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
