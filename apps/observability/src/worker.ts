import { initializeStorage, type ErrorLog } from "./db/schema";

interface Env {
  OBSERVABILITY_DB: D1Database;
  OWNER_EMAIL: string;
}

function isErrorOutcome(outcome: string): boolean {
  return outcome !== "ok" && outcome !== "canceled";
}

function getFetchInfo(event: TraceItem["event"]): { method: string | null; url: string | null; status: number | null } {
  if (!event) return { method: null, url: null, status: null };
  if ("request" in event) {
    const fetchEvent = event as TraceItemFetchEventInfo;
    return {
      method: fetchEvent.request?.method ?? null,
      url: fetchEvent.request?.url ?? null,
      status: fetchEvent.response?.status ?? null,
    };
  }
  return { method: null, url: null, status: null };
}

export default {
  async fetch() {
    return new Response("This worker only processes tail events", { status: 200 });
  },

  async tail(events: TraceItem[], env: Env, ctx: ExecutionContext) {
    const errors: ErrorLog[] = [];

    for (const trace of events) {
      if (!isErrorOutcome(trace.outcome)) continue;

      const fetchInfo = getFetchInfo(trace.event);
      const exception = trace.exceptions?.[0] ?? null;

      errors.push({
        id: crypto.randomUUID(),
        outcome: trace.outcome,
        scriptName: trace.scriptName ?? "unknown",
        method: fetchInfo.method,
        url: fetchInfo.url,
        status: fetchInfo.status,
        exceptionName: exception?.name ?? null,
        exceptionMessage: exception?.message ?? null,
        stack: exception?.stack ?? null,
        cpuTimeUs: trace.cpuTime ?? null,
        createdAt: new Date().toISOString(),
      });
    }

    if (errors.length === 0) return;

    ctx.waitUntil(
      (async () => {
        try {
          await initializeStorage(env.OBSERVABILITY_DB);

          const stmt = env.OBSERVABILITY_DB.prepare(
            `INSERT INTO error_logs (id, outcome, script_name, method, url, status, exception_name, exception_message, stack, cpu_time_us, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          );

          const batch = errors.map((e) =>
            stmt.bind(e.id, e.outcome, e.scriptName, e.method, e.url, e.status, e.exceptionName, e.exceptionMessage, e.stack, e.cpuTimeUs, e.createdAt),
          );

          await env.OBSERVABILITY_DB.batch(batch);
        } catch (err) {
          console.error("[observability] failed to persist errors", err);
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
