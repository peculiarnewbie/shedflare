import type { CfEnv } from "./env.ts";
import { cfGraphql } from "./cf-client.ts";
import { PLAN_LIMITS } from "./plan-limits.ts";
import {
  d1Query,
  doQuery,
  doStorageQuery,
  httpQuery,
  kvOpsQuery,
  kvStorageQuery,
  r2Query,
  r2StorageQuery,
  workersByScriptQuery,
  workersQuery,
} from "./queries.ts";

export interface UsageMetric {
  label: string;
  used: number;
  unit: string;
  limits: { free: number; paid: number; label?: string };
  note?: string;
}

export interface ProductUsage {
  id: string;
  name: string;
  metrics: UsageMetric[];
}

export interface UsagePeriod {
  start: string;
  end: string;
}

export interface UsageResponse {
  period: UsagePeriod;
  products: ProductUsage[];
  queryErrors: string[];
}

export interface ScriptUsage {
  scriptName: string;
  requests: number;
  errors: number;
}

function monthBounds(): UsagePeriod {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: start.toISOString(), end: now.toISOString() };
}

function elapsedDays(period: UsagePeriod): number {
  const start = new Date(period.start).getTime();
  const end = new Date(period.end).getTime();
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

function comparableLimits(
  limits: { free: number; paid: number; unit: string },
  period: UsagePeriod,
): { free: number; paid: number; label?: string } {
  if (limits.unit === "/day") {
    const days = elapsedDays(period);
    return {
      free: limits.free * days,
      paid: limits.paid * days,
      label: `${days} day${days === 1 ? "" : "s"} at daily limit`,
    };
  }
  if (limits.unit === "/month") return { free: limits.free, paid: limits.paid, label: "monthly limit" };
  return { free: limits.free, paid: limits.paid, label: limits.unit };
}

function safeSum(items: { sum?: Record<string, number | null> }[], key: string): number {
  let total = 0;
  for (const item of items) total += item.sum?.[key] ?? 0;
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

const CLASS_A_OPS = new Set([
  "PutObject",
  "CopyObject",
  "PutBucket",
  "PutBucketCors",
  "PutBucketEncryption",
  "PutBucketLifecycleConfiguration",
  "PutBucketTagging",
  "CreateMultipartUpload",
  "CompleteMultipartUpload",
  "UploadPart",
  "ListBuckets",
  "ListMultipartUploads",
  "UploadPartCopy",
]);

const CLASS_B_OPS = new Set([
  "HeadObject",
  "HeadBucket",
  "GetObject",
  "GetBucketLocation",
  "GetBucketLifecycleConfiguration",
  "GetBucketEncryption",
  "GetBucketTagging",
  "GetService",
  "DeleteObject",
  "DeleteObjects",
  "DeleteBucket",
  "AbortMultipartUpload",
]);

export async function fetchUsage(env: CfEnv): Promise<UsageResponse> {
  const period = monthBounds();
  const { accountId, apiToken: token, zoneId } = env;
  const queryErrors: string[] = [];

  async function query(label: string, fn: string) {
    try {
      return await cfGraphql<unknown>(token, fn);
    } catch (e) {
      queryErrors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  const [
    workersResult,
    d1Result,
    kvOpsResult,
    kvStorageResult,
    doResult,
    doStorageResult,
    r2Result,
    r2StorageResult,
    httpResult,
  ] = await Promise.all([
    query("workers", workersQuery(accountId, period.start, period.end)),
    query("d1", d1Query(accountId, period.start, period.end)),
    query("kvOps", kvOpsQuery(accountId, period.start, period.end)),
    query("kvStorage", kvStorageQuery(accountId, period.start, period.end)),
    query("durableObjects", doQuery(accountId, period.start, period.end)),
    query("doStorage", doStorageQuery(accountId, period.start, period.end)),
    query("r2", r2Query(accountId, period.start, period.end)),
    query("r2Storage", r2StorageQuery(accountId, period.start, period.end)),
    zoneId ? query("http", httpQuery(zoneId, period.start, period.end)) : Promise.resolve(null),
  ]);

  const products: ProductUsage[] = [];

  const workersData = workersResult as {
    viewer?: { accounts?: Array<{ workersInvocationsAdaptive?: Array<{ sum?: { requests?: number } }> }> };
  };
  const workersInvocations = workersData?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0];
  if (workersInvocations) {
    const sum = workersInvocations.sum ?? {};
    const limits = PLAN_LIMITS.find((p) => p.id === "workers")!.metrics;
    products.push({
      id: "workers",
      name: "Workers",
      metrics: [
        {
          label: "Requests",
          used: sum.requests ?? 0,
          unit: formatCount(sum.requests ?? 0),
          limits: comparableLimits(limits.requests, period),
          note: "GraphQL Analytics estimate; not billing-grade.",
        },
      ],
    });
  }

  const d1Groups =
    (d1Result as { viewer?: { accounts?: Array<{ d1AnalyticsAdaptiveGroups?: unknown[] }> } })
      ?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups ?? [];
  if (d1Groups.length > 0) {
    const limits = PLAN_LIMITS.find((p) => p.id === "d1")!.metrics;
    products.push({
      id: "d1",
      name: "D1",
      metrics: [
        {
          label: "Rows Read",
          used: safeSum(d1Groups as { sum?: Record<string, number> }[], "rowsRead"),
          unit: formatCount(safeSum(d1Groups as { sum?: Record<string, number> }[], "rowsRead")),
          limits: comparableLimits(limits.rowsRead, period),
          note: "GraphQL Analytics estimate; not billing-grade.",
        },
        {
          label: "Rows Written",
          used: safeSum(d1Groups as { sum?: Record<string, number> }[], "rowsWritten"),
          unit: formatCount(safeSum(d1Groups as { sum?: Record<string, number> }[], "rowsWritten")),
          limits: comparableLimits(limits.rowsWritten, period),
          note: "GraphQL Analytics estimate; not billing-grade.",
        },
      ],
    });
  }

  const kvOps =
    (kvOpsResult as { viewer?: { accounts?: Array<{ kvOperationsAdaptiveGroups?: unknown[] }> } })
      ?.viewer?.accounts?.[0]?.kvOperationsAdaptiveGroups ?? [];
  if (kvOps.length > 0) {
    const limits = PLAN_LIMITS.find((p) => p.id === "kv")!.metrics;
    const ops = kvOps as Array<{ count: number; dimensions?: { actionType?: string } }>;
    const reads = ops
      .filter((o) => o.dimensions?.actionType === "read")
      .reduce((s, o) => s + o.count, 0);
    const writes = ops
      .filter((o) => o.dimensions?.actionType === "write")
      .reduce((s, o) => s + o.count, 0);
    const storage = (
      kvStorageResult as {
        viewer?: { accounts?: Array<{ kvStorageAdaptiveGroups?: Array<{ max?: { byteCount?: number } }> }> };
      }
    )?.viewer?.accounts?.[0]?.kvStorageAdaptiveGroups?.[0]?.max;
    const metrics: UsageMetric[] = [
      {
        label: "Reads",
        used: reads,
        unit: formatCount(reads),
        limits: comparableLimits(limits.reads, period),
        note: "GraphQL Analytics estimate; not billing-grade.",
      },
      {
        label: "Writes",
        used: writes,
        unit: formatCount(writes),
        limits: comparableLimits(limits.writes, period),
        note: "GraphQL Analytics estimate; not billing-grade.",
      },
    ];
    if (storage) {
      metrics.push({
        label: "Storage",
        used: storage.byteCount ?? 0,
        unit: formatBytes(storage.byteCount ?? 0),
        limits: comparableLimits(limits.storage, period),
      });
    }
    products.push({ id: "kv", name: "Workers KV", metrics });
  }

  const doGroups =
    (doResult as {
      viewer?: { accounts?: Array<{ durableObjectsInvocationsAdaptiveGroups?: unknown[] }> };
    })?.viewer?.accounts?.[0]?.durableObjectsInvocationsAdaptiveGroups ?? [];
  if (doGroups.length > 0) {
    const limits = PLAN_LIMITS.find((p) => p.id === "durableObjects")!.metrics;
    const metrics: UsageMetric[] = [
      {
        label: "Requests",
        used: safeSum(doGroups as { sum?: Record<string, number> }[], "requests"),
        unit: formatCount(safeSum(doGroups as { sum?: Record<string, number> }[], "requests")),
        limits: comparableLimits(limits.requests, period),
        note: "GraphQL Analytics estimate; not billing-grade.",
      },
    ];
    const doStorage = (
      doStorageResult as {
        viewer?: { accounts?: Array<{ durableObjectsStorageGroups?: Array<{ max?: { storedBytes?: number } }> }> };
      }
    )?.viewer?.accounts?.[0]?.durableObjectsStorageGroups?.[0]?.max;
    if (doStorage?.storedBytes != null) {
      metrics.push({
        label: "Storage",
        used: doStorage.storedBytes,
        unit: formatBytes(doStorage.storedBytes),
        limits: comparableLimits(limits.storage, period),
      });
    }
    products.push({ id: "durableObjects", name: "Durable Objects", metrics });
  }

  const r2Ops =
    (r2Result as { viewer?: { accounts?: Array<{ r2OperationsAdaptiveGroups?: unknown[] }> } })
      ?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups ?? [];
  const r2Storage = (
    r2StorageResult as {
      viewer?: { accounts?: Array<{ r2StorageAdaptiveGroups?: Array<{ max?: { payloadSize?: number } }> }> };
    }
  )?.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups?.[0]?.max;
  const storageBytes = r2Storage?.payloadSize ?? 0;

  if (r2Ops.length > 0 || storageBytes > 0) {
    const limits = PLAN_LIMITS.find((p) => p.id === "r2")!.metrics;
    const ops = r2Ops as Array<{ sum?: { requests?: number }; dimensions?: { actionType?: string } }>;
    const classA = ops
      .filter((o) => CLASS_A_OPS.has(o.dimensions?.actionType ?? ""))
      .reduce((s, o) => s + (o.sum?.requests ?? 0), 0);
    const classB = ops
      .filter((o) => CLASS_B_OPS.has(o.dimensions?.actionType ?? ""))
      .reduce((s, o) => s + (o.sum?.requests ?? 0), 0);
    products.push({
      id: "r2",
      name: "R2",
      metrics: [
        {
          label: "Storage",
          used: storageBytes,
          unit: formatBytes(storageBytes),
          limits: comparableLimits(limits.storage, period),
        },
        {
          label: "Class A Ops",
          used: classA,
          unit: formatCount(classA),
          limits: comparableLimits(limits.classAOps, period),
          note: "Operation classification is approximate.",
        },
        {
          label: "Class B Ops",
          used: classB,
          unit: formatCount(classB),
          limits: comparableLimits(limits.classBOps, period),
          note: "Operation classification is approximate.",
        },
      ],
    });
  }

  const httpGroup = (
    httpResult as {
      viewer?: { zones?: Array<{ httpRequests1mGroups?: Array<{ sum?: { requests?: number; bytes?: number } }> }> };
    }
  )?.viewer?.zones?.[0]?.httpRequests1mGroups?.[0];
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
          limits: comparableLimits(limits.requests, period),
          note: "HTTP analytics can include traffic Cloudflare excludes from billing.",
        },
        {
          label: "Bandwidth",
          used: httpGroup.sum?.bytes ?? 0,
          unit: formatBytes(httpGroup.sum?.bytes ?? 0),
          limits: comparableLimits(limits.bandwidth, period),
          note: "HTTP analytics can differ from billable bandwidth.",
        },
      ],
    });
  }

  return { period, products, queryErrors };
}

export async function fetchScriptUsage(env: CfEnv): Promise<ScriptUsage[]> {
  const period = monthBounds();
  const data = await cfGraphql<{
    viewer?: {
      accounts?: Array<{
        workersInvocationsAdaptive?: Array<{
          sum?: { requests?: number; errors?: number };
          dimensions?: { scriptName?: string };
        }>;
      }>;
    };
  }>(env.apiToken, workersByScriptQuery(env.accountId, period.start, period.end));

  const rows = data.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
  return rows
    .map((row) => ({
      scriptName: row.dimensions?.scriptName ?? "unknown",
      requests: row.sum?.requests ?? 0,
      errors: row.sum?.errors ?? 0,
    }))
    .sort((a, b) => b.requests - a.requests);
}

export interface BillableUsageRecord {
  x_BillableMetricId?: string;
  x_BillableMetricName?: string;
  x_ProductFamilyName?: string;
  ConsumedQuantity: number;
  ConsumedUnit: string;
  ChargePeriodStart: string;
  ChargePeriodEnd: string;
  BilledCost?: number;
  EffectiveCost?: number;
}

export async function fetchBillableUsage(env: CfEnv): Promise<{
  records: BillableUsageRecord[];
  error?: string;
}> {
  try {
    const records = await (
      await import("./cf-client.ts")
    ).cfGet<BillableUsageRecord[]>(env.apiToken, `/accounts/${env.accountId}/billable/usage`);
    return { records };
  } catch (e) {
    return {
      records: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
