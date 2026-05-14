export interface UsageMetric {
  label: string;
  used: number;
  unit: string;
  limits: { free: number; paid: number };
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
}

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
