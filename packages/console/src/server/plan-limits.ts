export interface PlanLimit {
  free: number;
  paid: number;
  unit: string;
}

export const PLAN_LIMITS = [
  {
    id: "workers",
    name: "Workers",
    metrics: {
      requests: { free: 100_000, paid: 10_000_000, unit: "/day" },
    },
  },
  {
    id: "kv",
    name: "Workers KV",
    metrics: {
      reads: { free: 100_000, paid: 10_000_000, unit: "/day" },
      writes: { free: 1_000, paid: 1_000_000, unit: "/day" },
      storage: { free: 1_073_741_824, paid: 1_073_741_824, unit: "bytes" },
    },
  },
  {
    id: "d1",
    name: "D1",
    metrics: {
      rowsRead: { free: 5_000_000, paid: 25_000_000_000, unit: "/day" },
      rowsWritten: { free: 100_000, paid: 1_000_000, unit: "/day" },
    },
  },
  {
    id: "durableObjects",
    name: "Durable Objects",
    metrics: {
      requests: { free: 100_000, paid: 1_000_000, unit: "/day" },
      storage: { free: 1_073_741_824, paid: 1_073_741_824, unit: "bytes" },
    },
  },
  {
    id: "r2",
    name: "R2",
    metrics: {
      storage: { free: 10_737_418_240, paid: 10_737_418_240, unit: "bytes" },
      classAOps: { free: 1_000_000, paid: 1_000_000, unit: "/month" },
      classBOps: { free: 10_000_000, paid: 10_000_000, unit: "/month" },
    },
  },
  {
    id: "http",
    name: "HTTP / Bandwidth",
    metrics: {
      requests: { free: 100_000, paid: 10_000_000, unit: "/day" },
      bandwidth: { free: 1_073_741_824, paid: 1_099_511_627_776, unit: "bytes" },
    },
  },
] as const;
