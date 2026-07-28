import { HttpApiBuilder } from "effect/unstable/httpapi";
import { cfBillApi } from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";
import {
  d1Query,
  doQuery,
  httpQuery,
  kvOpsQuery,
  kvStorageQuery,
  r2Query,
  r2StorageQuery,
  workersQuery,
} from "../../api/queries";
import type { ProductUsage, UsagePeriod } from "../../api/types";
import { PLAN_LIMITS } from "../../plan-limits";

const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";

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
  if (limits.unit === "/month")
    return { free: limits.free, paid: limits.paid, label: "monthly limit" };
  return { free: limits.free, paid: limits.paid, label: limits.unit };
}

type AnalyticsSum = Record<string, number | null | undefined>;
type SumGroup = { sum?: AnalyticsSum };
type ActionCountGroup = { count?: number | null; dimensions?: { actionType?: string } };
type R2OperationGroup = {
  sum?: { requests?: number | null };
  dimensions?: { actionType?: string };
};
type StorageGroup = { max?: { byteCount?: number | null; payloadSize?: number | null } };
type AccountAnalytics = {
  workersInvocationsAdaptive?: SumGroup[];
  d1AnalyticsAdaptiveGroups?: SumGroup[];
  kvOperationsAdaptiveGroups?: ActionCountGroup[];
  kvStorageAdaptiveGroups?: StorageGroup[];
  durableObjectsInvocationsAdaptiveGroups?: SumGroup[];
  r2OperationsAdaptiveGroups?: R2OperationGroup[];
  r2StorageAdaptiveGroups?: StorageGroup[];
};
type ZoneAnalytics = { httpRequests1mGroups?: SumGroup[] };
type AccountAnalyticsResponse = { viewer?: { accounts?: AccountAnalytics[] } };
type ZoneAnalyticsResponse = { viewer?: { zones?: ZoneAnalytics[] } };

function accountAnalytics(data: unknown): AccountAnalytics | undefined {
  return (data as AccountAnalyticsResponse | null)?.viewer?.accounts?.[0];
}

function zoneAnalytics(data: unknown): ZoneAnalytics | undefined {
  return (data as ZoneAnalyticsResponse | null)?.viewer?.zones?.[0];
}

function safeSum(items: readonly SumGroup[], key: string): number {
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

async function graphqlQuery(env: { CF_API_TOKEN: string }, query: string): Promise<unknown> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.CF_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: query,
  });
  if (!res.ok) throw new Error(`GraphQL API error: ${res.status}`);
  const body = (await res.json()) as { data: unknown; errors?: unknown };
  if (body.errors) throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
  return body.data;
}

type UsageEnv = {
  CF_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_ZONE_ID?: string;
};

export function createUsageGroup(env: UsageEnv, auth: HttpApiAuth) {
  const endpoint = (cfBillApi as any).groups["usage"].endpoints["usage"];
  return (HttpApiBuilder.group as any)(cfBillApi, "usage", (handlers: any) => {
    handlers.handlers.set("usage", {
      endpoint,
      handler: auth.createProtectedHandler(async () => {
        const period = monthBounds();
        const accountId = env.CLOUDFLARE_ACCOUNT_ID;
        const zoneId = env.CLOUDFLARE_ZONE_ID;

        const queryErrors: string[] = [];
        async function query(label: string, fn: string) {
          try {
            return await graphqlQuery(env, fn);
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
          r2Result,
          r2StorageResult,
          httpResult,
        ] = await Promise.all([
          query("workers", workersQuery(accountId, period.start, period.end)),
          query("d1", d1Query(accountId, period.start, period.end)),
          query("kvOps", kvOpsQuery(accountId, period.start, period.end)),
          query("kvStorage", kvStorageQuery(accountId, period.start, period.end)),
          query("durableObjects", doQuery(accountId, period.start, period.end)),
          query("r2", r2Query(accountId, period.start, period.end)),
          query("r2Storage", r2StorageQuery(accountId, period.start, period.end)),
          zoneId
            ? query("http", httpQuery(zoneId, period.start, period.end))
            : Promise.resolve(null),
        ]);

        if (
          !workersResult &&
          !d1Result &&
          !kvOpsResult &&
          !kvStorageResult &&
          !doResult &&
          !r2Result &&
          !r2StorageResult &&
          !httpResult
        ) {
          const detail =
            queryErrors.length > 0
              ? `\nQuery errors:\n${queryErrors.map((e) => `  - ${e}`).join("\n")}`
              : "";
          throw new Error(`No usage data returned from Cloudflare API.${detail}`);
        }

        const products: ProductUsage[] = [];

        const workersInvocations = accountAnalytics(workersResult)?.workersInvocationsAdaptive?.[0];
        if (workersInvocations) {
          const sum = workersInvocations.sum ?? {};
          const limits = PLAN_LIMITS.find((p) => p.id === "workers")!.metrics;
          const requests = sum.requests ?? 0;
          products.push({
            id: "workers",
            name: "Workers",
            metrics: [
              {
                label: "Requests",
                used: requests,
                unit: formatCount(requests),
                limits: comparableLimits(limits.requests, period),
                note: "GraphQL Analytics estimate; not billing-grade.",
              },
            ],
          });
        }

        const d1Groups = accountAnalytics(d1Result)?.d1AnalyticsAdaptiveGroups ?? [];
        if (d1Groups.length > 0) {
          const limits = PLAN_LIMITS.find((p) => p.id === "d1")!.metrics;
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

        const kvOps = accountAnalytics(kvOpsResult)?.kvOperationsAdaptiveGroups ?? [];
        if (kvOps.length > 0) {
          const limits = PLAN_LIMITS.find((p) => p.id === "kv")!.metrics;
          const reads = kvOps
            .filter((o) => o.dimensions?.actionType === "read")
            .reduce((s, o) => s + (o.count ?? 0), 0);
          const writes = kvOps
            .filter((o) => o.dimensions?.actionType === "write")
            .reduce((s, o) => s + (o.count ?? 0), 0);
          const storage = accountAnalytics(kvStorageResult)?.kvStorageAdaptiveGroups?.[0]?.max;
          const metrics: ProductUsage["metrics"] = [
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

        const doGroups = accountAnalytics(doResult)?.durableObjectsInvocationsAdaptiveGroups ?? [];
        if (doGroups.length > 0) {
          const limits = PLAN_LIMITS.find((p) => p.id === "durableObjects")!.metrics;
          products.push({
            id: "durableObjects",
            name: "Durable Objects",
            metrics: [
              {
                label: "Requests",
                used: safeSum(doGroups, "requests"),
                unit: formatCount(safeSum(doGroups, "requests")),
                limits: comparableLimits(limits.requests, period),
                note: "GraphQL Analytics estimate; not billing-grade.",
              },
            ],
          });
        }

        const r2Ops = accountAnalytics(r2Result)?.r2OperationsAdaptiveGroups ?? [];
        const r2Storage = accountAnalytics(r2StorageResult)?.r2StorageAdaptiveGroups?.[0]?.max;
        const storageBytes = r2Storage?.payloadSize ?? 0;

        if (r2Ops.length > 0 || storageBytes > 0) {
          const limits = PLAN_LIMITS.find((p) => p.id === "r2")!.metrics;
          const classA = r2Ops
            .filter((o) =>
              [
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
              ].includes(o.dimensions?.actionType ?? ""),
            )
            .reduce((s, o) => s + (o.sum?.requests ?? 0), 0);
          const classB = r2Ops
            .filter((o) =>
              [
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
              ].includes(o.dimensions?.actionType ?? ""),
            )
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

        const httpGroup = zoneAnalytics(httpResult)?.httpRequests1mGroups?.[0];
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

        return { period, products };
      }),
      isRaw: false,
      uninterruptible: false,
    });
    return handlers;
  });
}
