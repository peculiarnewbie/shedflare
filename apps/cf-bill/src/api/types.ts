import { array, number, object, optional, picklist, string, type InferOutput } from "valibot";

export const UsagePeriodSchema = object({ start: string(), end: string() });
export type UsagePeriod = InferOutput<typeof UsagePeriodSchema>;

export const UsageMetricSchema = object({
  label: string(),
  used: number(),
  unit: string(),
  limits: object({ free: number(), paid: number(), label: optional(string()) }),
  note: optional(string()),
});
export type UsageMetric = InferOutput<typeof UsageMetricSchema>;

export const ProductUsageSchema = object({
  id: picklist(["workers", "kv", "d1", "durableObjects", "r2", "http"]),
  name: string(),
  metrics: array(UsageMetricSchema),
});
export type ProductUsage = InferOutput<typeof ProductUsageSchema>;

export const UsageResponseSchema = object({
  period: UsagePeriodSchema,
  products: array(ProductUsageSchema),
});
export type UsageResponse = InferOutput<typeof UsageResponseSchema>;

export interface WorkersInvocation {
  requests: number;
  cpuTime: number;
  errors: number;
}

export interface D1AnalyticGroup {
  sum: {
    rowsRead: number;
    rowsWritten: number;
    queryCount: number;
  };
  dimensions: {
    databaseId: string;
  };
}

export interface KVOperationGroup {
  count: number;
  dimensions: {
    operationType: string;
  };
}

export interface KVStorageSum {
  keyCount: number;
  storedBytes: number;
}

export interface DurableObjectGroup {
  sum: {
    requests: number;
    cpuTime: number;
  };
  dimensions: {
    namespaceId: string;
  };
}

export interface R2AnalyticGroup {
  sum: {
    objectSize: number;
    storageBytes: number;
    count: number;
  };
  dimensions: {
    operationType: string;
  };
}

export interface HttpRequest1mGroup {
  sum: {
    requests: number;
    bytes: number;
  };
}
