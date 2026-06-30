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

export interface UsageResponse {
  period: { start: string; end: string };
  products: ProductUsage[];
  queryErrors: string[];
}

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

export interface ShedflareConfig {
  domain: string;
  ownerEmail: string;
  apps: Record<string, { enabled?: boolean; subdomain: string }>;
  vars?: Record<string, Record<string, string>>;
}

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
