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
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
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

        const workersData = workersResult as any;
        const workersInvocations =
          workersData?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0];
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
                used: safeSum(d1Groups, "rowsRead"),
                unit: formatCount(safeSum(d1Groups, "rowsRead")),
                limits: { free: limits.rowsRead.free, paid: limits.rowsRead.paid },
              },
              {
                label: "Rows Written",
                used: safeSum(d1Groups, "rowsWritten"),
                unit: formatCount(safeSum(d1Groups, "rowsWritten")),
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
            .filter((o: any) => o.dimensions?.actionType === "read")
            .reduce((s: number, o: any) => s + o.count, 0);
          const writes = kvOps
            .filter((o: any) => o.dimensions?.actionType === "write")
            .reduce((s: number, o: any) => s + o.count, 0);
          const storage = (kvStorageResult as any)?.viewer?.accounts?.[0]
            ?.kvStorageAdaptiveGroups?.[0]?.max;
          const metrics: any[] = [
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
              used: storage.byteCount ?? 0,
              unit: formatBytes(storage.byteCount ?? 0),
              limits: { free: limits.storage.free, paid: limits.storage.paid },
            });
          }
          products.push({ id: "kv", name: "Workers KV", metrics });
        }

        const doData = doResult as any;
        const doGroups = (doData?.viewer?.accounts?.[0]?.durableObjectsInvocationsAdaptiveGroups ??
          []) as any[];
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
                limits: { free: limits.requests.free, paid: limits.requests.paid },
              },
            ],
          });
        }

        const r2Data = r2Result as any;
        const r2Ops = (r2Data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups ?? []) as any[];
        const r2Storage = (r2StorageResult as any)?.viewer?.accounts?.[0]
          ?.r2StorageAdaptiveGroups?.[0]?.max;
        const storageBytes = r2Storage?.payloadSize ?? 0;

        if (r2Ops.length > 0 || storageBytes > 0) {
          const limits = PLAN_LIMITS.find((p) => p.id === "r2")!.metrics;
          const classA = r2Ops
            .filter((o: any) =>
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
              ].includes(o.dimensions?.actionType),
            )
            .reduce((s: number, o: any) => s + (o.sum?.requests ?? 0), 0);
          const classB = r2Ops
            .filter((o: any) =>
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
              ].includes(o.dimensions?.actionType),
            )
            .reduce((s: number, o: any) => s + (o.sum?.requests ?? 0), 0);

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

        return { period, products };
      }),
      isRaw: false,
      uninterruptible: false,
    });
    return handlers;
  });
}
