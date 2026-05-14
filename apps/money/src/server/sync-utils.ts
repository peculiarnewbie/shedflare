export { json, parseJson, isWebSocketRequest, nowIso } from "@shedflare/sync-protocol";

export async function parseJsonRequest(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return body;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
}

export function parseInternalCommandBody(
  body: Record<string, unknown>,
): { opId: string; commandType: string; payload: unknown } | Response {
  const { opId, commandType, payload } = body;
  if (typeof opId !== "string" || typeof commandType !== "string" || !payload) {
    return new Response("Invalid command body", { status: 400 });
  }
  return { opId, commandType, payload };
}

export function boolToSql(value: boolean | null | undefined): number {
  return value ? 1 : 0;
}

export function sqlToBool(value: unknown): boolean {
  if (typeof value === "number") return value === 1;
  if (typeof value === "boolean") return value;
  return false;
}

export function syncLog(message: string, details?: Record<string, unknown>) {
  const entry = JSON.stringify({ scope: "money-sync", event: message, ...details });
  console.log(entry);
}

export function syncLogError(message: string, error?: unknown) {
  const entry = JSON.stringify({
    scope: "money-sync",
    event: message,
    level: "error",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  console.error(entry);
}

export const DATA_TABLES = [
  "accounts",
  "categories",
  "category_groups",
  "transactions",
  "budgets",
  "budget_months",
  "payees",
  "schedules",
  "rules",
  "tags",
  "transaction_tags",
  "custom_reports",
  "dashboard_widgets",
  "exchange_rates",
  "settings",
] as const;

export type DataTableName = (typeof DATA_TABLES)[number];
