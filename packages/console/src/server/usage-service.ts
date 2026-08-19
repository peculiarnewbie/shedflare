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
import {
  array,
  nullable,
  number,
  object,
  optional,
  string,
  type GenericSchema,
  type InferOutput,
} from "valibot";

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

interface ComparableLimits {
  free: number;
  paid: number;
  label?: string;
}

function comparableLimits(
  limits: { free: number; paid: number; unit: string },
  period: UsagePeriod,
): ComparableLimits {
  if (limits.unit === "/day") {
    const days = elapsedDays(period);
    return {
      free: limits.free * days,
      paid: limits.paid * days,
      label: `${days} day${days === 1 ? "" : "s"} at daily limit`,
    };
  }
  if (limits.unit === "/month")
    return { free: limits.free, paid: limits.paid, label: "monthly limit" };
  return { free: limits.free, paid: limits.paid, label: limits.unit };
}

const OptionalNumber = optional(nullable(number()));
const SumGroupSchema = object({
  sum: optional(
    object({
      requests: OptionalNumber,
      errors: OptionalNumber,
      bytes: OptionalNumber,
      rowsRead: OptionalNumber,
      rowsWritten: OptionalNumber,
    }),
  ),
});
type SumGroup = InferOutput<typeof SumGroupSchema>;
const AccountAnalyticsSchema = object({
  viewer: optional(
    object({
      accounts: optional(
        array(
          object({
            workersInvocationsAdaptive: optional(
              array(
                object({
                  sum: optional(object({ requests: OptionalNumber, errors: OptionalNumber })),
                  dimensions: optional(object({ scriptName: optional(string()) })),
                }),
              ),
            ),
            d1AnalyticsAdaptiveGroups: optional(array(SumGroupSchema)),
            kvOperationsAdaptiveGroups: optional(
              array(
                object({
                  count: OptionalNumber,
                  dimensions: optional(object({ actionType: optional(string()) })),
                }),
              ),
            ),
            kvStorageAdaptiveGroups: optional(
              array(object({ max: optional(object({ byteCount: OptionalNumber })) })),
            ),
            durableObjectsInvocationsAdaptiveGroups: optional(array(SumGroupSchema)),
            durableObjectsStorageGroups: optional(
              array(object({ max: optional(object({ storedBytes: OptionalNumber })) })),
            ),
            r2OperationsAdaptiveGroups: optional(
              array(
                object({
                  sum: optional(object({ requests: OptionalNumber })),
                  dimensions: optional(object({ actionType: optional(string()) })),
                }),
              ),
            ),
            r2StorageAdaptiveGroups: optional(
              array(object({ max: optional(object({ payloadSize: OptionalNumber })) })),
            ),
          }),
        ),
      ),
    }),
  ),
});
const ZoneAnalyticsSchema = object({
  viewer: optional(
    object({
      zones: optional(array(object({ httpRequests1mGroups: optional(array(SumGroupSchema)) }))),
    }),
  ),
});

function safeSum(items: readonly SumGroup[], key: string): number {
  let total = 0;
  for (const item of items) {
    if (key === "requests") total += item.sum?.requests ?? 0;
    else if (key === "rowsRead") total += item.sum?.rowsRead ?? 0;
    else if (key === "rowsWritten") total += item.sum?.rowsWritten ?? 0;
  }
  return total;
}

type ProductLimit = (typeof PLAN_LIMITS)[number];

function productLimit<ProductId extends ProductLimit["id"]>(
  id: ProductId,
): Extract<ProductLimit, { id: ProductId }> {
  const product = PLAN_LIMITS.find((candidate) => candidate.id === id);
  if (!product) throw new Error(`Missing plan limits for ${id}`);
  // SAFETY: the successful runtime equality check above establishes the matching id variant.
  return product as Extract<ProductLimit, { id: ProductId }>;
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

  async function query<ResultSchema extends GenericSchema>(
    label: string,
    fn: string,
    schema: ResultSchema,
  ) {
    try {
      return await cfGraphql(token, fn, schema);
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
    query("workers", workersQuery(accountId, period.start, period.end), AccountAnalyticsSchema),
    query("d1", d1Query(accountId, period.start, period.end), AccountAnalyticsSchema),
    query("kvOps", kvOpsQuery(accountId, period.start, period.end), AccountAnalyticsSchema),
    query("kvStorage", kvStorageQuery(accountId, period.start, period.end), AccountAnalyticsSchema),
    query("durableObjects", doQuery(accountId, period.start, period.end), AccountAnalyticsSchema),
    query("doStorage", doStorageQuery(accountId, period.start, period.end), AccountAnalyticsSchema),
    query("r2", r2Query(accountId, period.start, period.end), AccountAnalyticsSchema),
    query("r2Storage", r2StorageQuery(accountId, period.start, period.end), AccountAnalyticsSchema),
    zoneId
      ? query("http", httpQuery(zoneId, period.start, period.end), ZoneAnalyticsSchema)
      : Promise.resolve(null),
  ]);

  const products: ProductUsage[] = [];

  const workersInvocations = workersResult?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0];
  if (workersInvocations) {
    const sum = workersInvocations.sum ?? {};
    const limits = productLimit("workers").metrics;
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

  const d1Groups = d1Result?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups ?? [];
  if (d1Groups.length > 0) {
    const limits = productLimit("d1").metrics;
    products.push({
      id: "d1",
      name: "D1",
      metrics: [
        {
          label: "Rows Read",
          used: safeSum(d1Groups, "rowsRead"),
          unit: formatCount(safeSum(d1Groups, "rowsRead")),
          limits: comparableLimits(limits.rowsRead, period),
          note: "GraphQL Analytics estimate; not billing-grade.",
        },
        {
          label: "Rows Written",
          used: safeSum(d1Groups, "rowsWritten"),
          unit: formatCount(safeSum(d1Groups, "rowsWritten")),
          limits: comparableLimits(limits.rowsWritten, period),
          note: "GraphQL Analytics estimate; not billing-grade.",
        },
      ],
    });
  }

  const kvOps = kvOpsResult?.viewer?.accounts?.[0]?.kvOperationsAdaptiveGroups ?? [];
  if (kvOps.length > 0) {
    const limits = productLimit("kv").metrics;
    const reads = kvOps
      .filter((o) => o.dimensions?.actionType === "read")
      .reduce((s, o) => s + (o.count ?? 0), 0);
    const writes = kvOps
      .filter((o) => o.dimensions?.actionType === "write")
      .reduce((s, o) => s + (o.count ?? 0), 0);
    const storage = kvStorageResult?.viewer?.accounts?.[0]?.kvStorageAdaptiveGroups?.[0]?.max;
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

  const doGroups = doResult?.viewer?.accounts?.[0]?.durableObjectsInvocationsAdaptiveGroups ?? [];
  if (doGroups.length > 0) {
    const limits = productLimit("durableObjects").metrics;
    const metrics: UsageMetric[] = [
      {
        label: "Requests",
        used: safeSum(doGroups, "requests"),
        unit: formatCount(safeSum(doGroups, "requests")),
        limits: comparableLimits(limits.requests, period),
        note: "GraphQL Analytics estimate; not billing-grade.",
      },
    ];
    const doStorage = doStorageResult?.viewer?.accounts?.[0]?.durableObjectsStorageGroups?.[0]?.max;
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

  const r2Ops = r2Result?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups ?? [];
  const r2Storage = r2StorageResult?.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups?.[0]?.max;
  const storageBytes = r2Storage?.payloadSize ?? 0;

  if (r2Ops.length > 0 || storageBytes > 0) {
    const limits = productLimit("r2").metrics;
    const classA = r2Ops
      .filter((o) => CLASS_A_OPS.has(o.dimensions?.actionType ?? ""))
      .reduce((s, o) => s + (o.sum?.requests ?? 0), 0);
    const classB = r2Ops
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

  const httpGroup = httpResult?.viewer?.zones?.[0]?.httpRequests1mGroups?.[0];
  if (httpGroup) {
    const limits = productLimit("http").metrics;
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
  const data = await cfGraphql(
    env.apiToken,
    workersByScriptQuery(env.accountId, period.start, period.end),
    AccountAnalyticsSchema,
  );

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

const BillableUsageRecordSchema = object({
  x_BillableMetricId: optional(string()),
  x_BillableMetricName: optional(string()),
  x_ProductFamilyName: optional(string()),
  ConsumedQuantity: number(),
  ConsumedUnit: string(),
  ChargePeriodStart: string(),
  ChargePeriodEnd: string(),
  BilledCost: optional(number()),
  EffectiveCost: optional(number()),
});

export async function fetchBillableUsage(env: CfEnv): Promise<{
  records: BillableUsageRecord[];
  error?: string;
}> {
  try {
    const records = await (
      await import("./cf-client.ts")
    ).cfGet(
      env.apiToken,
      `/accounts/${env.accountId}/billable/usage`,
      array(BillableUsageRecordSchema),
    );
    return { records };
  } catch (e) {
    return {
      records: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
