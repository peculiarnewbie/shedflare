import { createAuthHandlers, type AuthEnv } from "@shedflare/auth-client/consumer";
import {
  d1Query,
  doQuery,
  httpQuery,
  kvOpsQuery,
  kvStorageQuery,
  r2Query,
  workersQuery,
} from "./api/queries";
import type { ProductUsage, UsageMetric, UsagePeriod, UsageResponse } from "./api/types";
import { PLAN_LIMITS } from "./plan-limits";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CF_API_TOKEN: SecretsStoreSecret;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_ZONE_ID?: string;
};

const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function graphqlQuery(env: Env, query: string): Promise<unknown> {
  const token = await env.CF_API_TOKEN.get();
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: query,
  });
  if (!res.ok) throw new Error(`GraphQL API error: ${res.status}`);
  const body = (await res.json()) as { data: unknown; errors?: unknown };
  if (body.errors) throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
  return body.data;
}

function monthBounds(): UsagePeriod {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function safeSum(items: { sum?: Record<string, number | null> }[], key: string): number {
  let total = 0;
  for (const item of items) {
    total += item.sum?.[key] ?? 0;
  }
  return total;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

async function handleUsage(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuthHandlers>,
) {
  const session = await auth.requireSession(request);
  const period = monthBounds();
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const zoneId = env.CLOUDFLARE_ZONE_ID;

  const [workersResult, d1Result, kvOpsResult, kvStorageResult, doResult, r2Result, httpResult] =
    await Promise.all([
      graphqlQuery(env, workersQuery(accountId, period.start, period.end)).catch(() => null),
      graphqlQuery(env, d1Query(accountId, period.start, period.end)).catch(() => null),
      graphqlQuery(env, kvOpsQuery(accountId, period.start, period.end)).catch(() => null),
      graphqlQuery(env, kvStorageQuery(accountId)).catch(() => null),
      graphqlQuery(env, doQuery(accountId, period.start, period.end)).catch(() => null),
      graphqlQuery(env, r2Query(accountId, period.start, period.end)).catch(() => null),
      zoneId
        ? graphqlQuery(env, httpQuery(zoneId, period.start, period.end)).catch(() => null)
        : Promise.resolve(null),
    ]);

  const products: ProductUsage[] = [];

  const workersData = workersResult as any;
  const workersInvocations = workersData?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0];
  if (workersInvocations) {
    const sum = workersInvocations.sum as any;
    const limits = PLAN_LIMITS.find((p) => p.id === "workers")!.metrics;
    products.push({
      id: "workers",
      name: "Workers",
      metrics: [
        {
          label: "Requests",
          used: sum.requests ?? 0,
          unit: formatCount(sum.requests ?? 0),
          limits: { free: limits.requests.free, paid: limits.requests.paid },
        },
        {
          label: "CPU Time",
          used: sum.cpuTime ?? 0,
          unit: `${((sum.cpuTime ?? 0) / 1000).toFixed(0)}s`,
          limits: { free: limits.cpuTime.free, paid: limits.cpuTime.paid },
        },
        {
          label: "Errors",
          used: sum.errors ?? 0,
          unit: formatCount(sum.errors ?? 0),
          limits: { free: limits.errors.free, paid: limits.errors.paid },
        },
      ],
    });
  }

  const d1Data = d1Result as any;
  const d1Groups = (d1Data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups ?? []) as any[];
  if (d1Groups.length > 0) {
    const limits = PLAN_LIMITS.find((p) => p.id === "d1")!.metrics;
    products.push({
      id: "d1",
      name: "D1",
      metrics: [
        {
          label: "Rows Read",
          used: safeSum(d1Groups as any, "rowsRead"),
          unit: formatCount(safeSum(d1Groups as any, "rowsRead")),
          limits: { free: limits.rowsRead.free, paid: limits.rowsRead.paid },
        },
        {
          label: "Rows Written",
          used: safeSum(d1Groups as any, "rowsWritten"),
          unit: formatCount(safeSum(d1Groups as any, "rowsWritten")),
          limits: { free: limits.rowsWritten.free, paid: limits.rowsWritten.paid },
        },
      ],
    });
  }

  const kvOpsData = kvOpsResult as any;
  const kvOps = (kvOpsData?.viewer?.accounts?.[0]?.kvOperationsAdaptiveGroups ?? []) as any[];
  if (kvOps.length > 0) {
    const limits = PLAN_LIMITS.find((p) => p.id === "kv")!.metrics;
    const reads = kvOps
      .filter((o) => o.dimensions?.operationType === "read")
      .reduce((s, o) => s + o.count, 0);
    const writes = kvOps
      .filter((o) => o.dimensions?.operationType === "write")
      .reduce((s, o) => s + o.count, 0);
    const storage = (kvStorageResult as any)?.viewer?.accounts?.[0]?.kvStorageAdaptiveGroups?.[0]
      ?.sum;

    const metrics: UsageMetric[] = [
      {
        label: "Reads",
        used: reads,
        unit: formatCount(reads),
        limits: { free: limits.reads.free, paid: limits.reads.paid },
      },
      {
        label: "Writes",
        used: writes,
        unit: formatCount(writes),
        limits: { free: limits.writes.free, paid: limits.writes.paid },
      },
    ];
    if (storage) {
      metrics.push({
        label: "Storage",
        used: storage.storedBytes ?? 0,
        unit: formatBytes(storage.storedBytes ?? 0),
        limits: { free: limits.storage.free, paid: limits.storage.paid },
      });
    }
    products.push({ id: "kv", name: "Workers KV", metrics });
  }

  const doData = doResult as any;
  const doGroups = (doData?.viewer?.accounts?.[0]?.durableObjectsInvocationsAdaptive ??
    []) as any[];
  if (doGroups.length > 0) {
    const limits = PLAN_LIMITS.find((p) => p.id === "durableObjects")!.metrics;
    products.push({
      id: "durableObjects",
      name: "Durable Objects",
      metrics: [
        {
          label: "Requests",
          used: safeSum(doGroups as any, "requests"),
          unit: formatCount(safeSum(doGroups as any, "requests")),
          limits: { free: limits.requests.free, paid: limits.requests.paid },
        },
      ],
    });
  }

  const r2Data = r2Result as any;
  const r2Ops = (r2Data?.viewer?.accounts?.[0]?.r2AnalyticsAdaptiveGroups ?? []) as any[];
  if (r2Ops.length > 0) {
    const limits = PLAN_LIMITS.find((p) => p.id === "r2")!.metrics;
    const classA = r2Ops
      .filter((o) => o.dimensions?.operationType === "classA")
      .reduce((s, o) => s + (o.sum?.count ?? 0), 0);
    const classB = r2Ops
      .filter((o) => o.dimensions?.operationType === "classB")
      .reduce((s, o) => s + (o.sum?.count ?? 0), 0);
    const storageBytes = r2Ops.reduce((s, o) => s + (o.sum?.storageBytes ?? 0), 0);

    products.push({
      id: "r2",
      name: "R2",
      metrics: [
        {
          label: "Storage",
          used: storageBytes,
          unit: formatBytes(storageBytes),
          limits: { free: limits.storage.free, paid: limits.storage.paid },
        },
        {
          label: "Class A Ops",
          used: classA,
          unit: formatCount(classA),
          limits: { free: limits.classAOps.free, paid: limits.classAOps.paid },
        },
        {
          label: "Class B Ops",
          used: classB,
          unit: formatCount(classB),
          limits: { free: limits.classBOps.free, paid: limits.classBOps.paid },
        },
      ],
    });
  }

  const httpData = httpResult as any;
  const httpGroup = httpData?.viewer?.zones?.[0]?.httpRequests1mGroups?.[0] as any;
  if (httpGroup) {
    const limits = PLAN_LIMITS.find((p) => p.id === "http")!.metrics;
    products.push({
      id: "http",
      name: "HTTP / Bandwidth",
      metrics: [
        {
          label: "Requests",
          used: httpGroup.sum?.requests ?? 0,
          unit: formatCount(httpGroup.sum?.requests ?? 0),
          limits: { free: limits.requests.free, paid: limits.requests.paid },
        },
        {
          label: "Bandwidth",
          used: httpGroup.sum?.bytes ?? 0,
          unit: formatBytes(httpGroup.sum?.bytes ?? 0),
          limits: { free: limits.bandwidth.free, paid: limits.bandwidth.paid },
        },
      ],
    });
  }

  const response: UsageResponse = { period, products };
  return auth.withSessionCookies(json(response), session);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const auth = createAuthHandlers(env);

    try {
      if (!pathname.startsWith("/api/")) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status === 404) {
          return await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
        }
        return assetResponse;
      }

      if (pathname === "/api/auth/login" && request.method === "GET")
        return await auth.loginRedirect();
      if (pathname === "/api/auth/callback" && request.method === "GET")
        return await auth.handleCallback(request);
      if (pathname === "/api/auth/logout" && request.method === "POST") return auth.logout();
      if (pathname === "/api/session" && request.method === "GET")
        return await auth.sessionEndpoint(request);
      if (pathname === "/api/usage" && request.method === "GET")
        return await handleUsage(request, env, auth);

      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof Response) return error;
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
