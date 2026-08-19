import { drizzle } from "drizzle-orm/d1";
import { errorLogs, type NewErrorLog } from "./db/schema";

interface Env {
  OBSERVABILITY_DB: D1Database;
  OWNER_EMAIL: string;
}

function isErrorOutcome(outcome: string): boolean {
  return outcome !== "ok" && outcome !== "canceled";
}

interface FetchInfo {
  method: string | null;
  url: string | null;
  status: number | null;
}

function getFetchInfo(event: TraceItem["event"]): FetchInfo {
  if (!event) return { method: null, url: null, status: null };
  if ("request" in event) {
    // SAFETY: the Workers trace event contract identifies fetch events by the request property.
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
    const errors: NewErrorLog[] = [];

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
          const db = drizzle(env.OBSERVABILITY_DB);
          await db.insert(errorLogs).values(errors).run();
        } catch (err) {
          console.error("[observability] failed to persist errors", err);
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
