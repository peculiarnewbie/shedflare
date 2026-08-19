import { ShedflareConfigV2Schema } from "@shedflare/core";
import {
  array,
  boolean,
  literal,
  nullable,
  number,
  object,
  optional,
  record,
  string,
  union,
  type InferOutput,
} from "valibot";

export const UsageMetricSchema = object({
  label: string(),
  used: number(),
  unit: string(),
  limits: object({ free: number(), paid: number(), label: optional(string()) }),
  note: optional(string()),
});
export type UsageMetric = InferOutput<typeof UsageMetricSchema>;

export const ProductUsageSchema = object({
  id: string(),
  name: string(),
  metrics: array(UsageMetricSchema),
});
export type ProductUsage = InferOutput<typeof ProductUsageSchema>;

export const UsageResponseSchema = object({
  period: object({ start: string(), end: string() }),
  products: array(ProductUsageSchema),
  queryErrors: array(string()),
});
export type UsageResponse = InferOutput<typeof UsageResponseSchema>;

export interface ManifestSummary {
  id: string;
  name: string;
  description: string;
  dependsOn: string[];
  defaultSubdomain: string;
  secretNames: string[];
  resourceTypes: string[];
}

export interface AppStatus {
  id: string;
  manifest: ManifestSummary | null;
  enabled: boolean;
  subdomain: string;
  url: string | null;
  workerName: string;
  workerDeployed: boolean;
  dashboardUrl: string;
  secrets: Array<{ name: string; set: boolean }>;
}

export interface SuiteOverview {
  configPresent: boolean;
  domain?: string;
  ownerEmail?: string;
  deployStage: string;
  accountId: string;
  cfTokenValid: boolean;
  apps: AppStatus[];
  inventory: {
    workers: Array<{ id: string }>;
    d1: Array<{ uuid: string; name: string }>;
    r2: Array<{ name: string }>;
    kv: Array<{ id: string; title: string }>;
  };
  inventoryErrors: string[];
  dashboardLinks: Record<string, string>;
}

const ManifestSummarySchema = object({
  id: string(),
  name: string(),
  description: string(),
  lifecycle: string(),
  category: string(),
  dataSensitivity: string(),
  dependsOn: array(string()),
  defaultSubdomain: string(),
  secretNames: array(string()),
  resourceTypes: array(string()),
});
const AppStatusSchema = object({
  id: string(),
  manifest: nullable(ManifestSummarySchema),
  enabled: boolean(),
  subdomain: string(),
  url: nullable(string()),
  workerName: string(),
  workerDeployed: boolean(),
  dashboardUrl: string(),
  secrets: array(object({ name: string(), set: boolean() })),
});
export const SuiteOverviewSchema = object({
  configPresent: boolean(),
  domain: optional(string()),
  ownerEmail: optional(string()),
  deployStage: string(),
  accountId: string(),
  cfTokenValid: boolean(),
  apps: array(AppStatusSchema),
  inventory: object({
    workers: array(object({ id: string() })),
    d1: array(object({ uuid: string(), name: string() })),
    r2: array(object({ name: string() })),
    kv: array(object({ id: string(), title: string() })),
  }),
  inventoryErrors: array(string()),
  dashboardLinks: record(string(), string()),
});

export const BillableUsageRecordSchema = object({
  x_BillableMetricId: optional(string()),
  x_BillableMetricName: optional(string()),
  x_ProductFamilyName: optional(string()),
  ConsumedQuantity: number(),
  ConsumedUnit: string(),
  ChargePeriodStart: string(),
  BilledCost: optional(number()),
  EffectiveCost: optional(number()),
});
export const BillableUsageResponseSchema = object({
  records: array(BillableUsageRecordSchema),
  error: optional(string()),
});

export const StageListSchema = object({ stages: array(string()), currentStage: string() });

const StringMapSchema = record(string(), string());
const ShedflareConfigV1ClientSchema = object({
  configVersion: literal(1),
  domain: string(),
  ownerEmail: string(),
  apps: record(string(), object({ enabled: optional(boolean()), subdomain: string() })),
  vars: record(string(), StringMapSchema),
  resources: record(string(), StringMapSchema),
});
export const ConfigResponseSchema = object({
  config: nullable(union([ShedflareConfigV1ClientSchema, ShedflareConfigV2Schema])),
  configPath: string(),
});

export type { ShedflareConfig } from "@shedflare/core";

export interface BillableUsageRecord {
  x_BillableMetricId?: string;
  x_BillableMetricName?: string;
  x_ProductFamilyName?: string;
  ConsumedQuantity: number;
  ConsumedUnit: string;
  ChargePeriodStart: string;
  BilledCost?: number;
  EffectiveCost?: number;
}
