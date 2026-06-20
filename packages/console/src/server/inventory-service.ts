import { listWorkerSecretNames, type CfCredentials } from "@shedflare/alchemy";
import * as Redacted from "effect/Redacted";
import type { CfEnv } from "./env.ts";
import { cfGet, verifyCfToken } from "./cf-client.ts";
import { cfDashboardUrl, physicalWorkerName, resolveDeployStage, workerDashboardUrl } from "./env.ts";
import {
  appUrl,
  discoverAppIds,
  loadConfig,
  loadManifest,
  type ManifestSummary,
} from "./config-service.ts";

export interface WorkerScript {
  id: string;
  created_on?: string;
  modified_on?: string;
}

export interface D1Database {
  uuid: string;
  name: string;
  created_at?: string;
}

export interface R2Bucket {
  name: string;
  creation_date?: string;
}

export interface KvNamespace {
  id: string;
  title: string;
}

export interface CfInventory {
  workers: WorkerScript[];
  d1: D1Database[];
  r2: R2Bucket[];
  kv: KvNamespace[];
}

export async function fetchInventory(env: CfEnv): Promise<CfInventory> {
  const accountId = env.accountId;
  const token = env.apiToken;

  const [workers, d1, r2, kv] = await Promise.all([
    cfGet<WorkerScript[]>(token, `/accounts/${accountId}/workers/scripts`).catch(() => []),
    cfGet<D1Database[]>(token, `/accounts/${accountId}/d1/database`).catch(() => []),
    cfGet<{ buckets?: R2Bucket[] }>(token, `/accounts/${accountId}/r2/buckets`)
      .then((r) => r.buckets ?? [])
      .catch(() => []),
    cfGet<KvNamespace[]>(token, `/accounts/${accountId}/storage/kv/namespaces`).catch(() => []),
  ]);

  return { workers, d1, r2, kv };
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

export async function buildAppStatuses(env: CfEnv): Promise<AppStatus[]> {
  const config = loadConfig();
  const inventory = await fetchInventory(env);
  const workerIds = new Set(inventory.workers.map((w) => w.id));
  const appIds = discoverAppIds();

  const credentials: CfCredentials = {
    type: "apiToken",
    apiToken: Redacted.make(env.apiToken),
    accountId: env.accountId,
  };

  const statuses: AppStatus[] = [];

  for (const id of appIds) {
    const manifest = loadManifest(id);
    const entry = config?.apps[id];
    const enabled = entry?.enabled !== false && Boolean(entry);
    const subdomain = entry?.subdomain ?? manifest?.defaultSubdomain ?? id;
    const workerName = physicalWorkerName(id);
    const workerDeployed = workerIds.has(workerName);

    let secrets: Array<{ name: string; set: boolean }> = [];
    if (manifest && workerDeployed) {
      try {
        const namesOnCf = new Set(
          await listWorkerSecretNames(credentials, env.accountId, workerName),
        );
        secrets = manifest.secretNames.map((name) => ({
          name,
          set: namesOnCf.has(name),
        }));
      } catch {
        secrets = manifest.secretNames.map((name) => ({ name, set: false }));
      }
    } else if (manifest) {
      secrets = manifest.secretNames.map((name) => ({ name, set: false }));
    }

    statuses.push({
      id,
      manifest,
      enabled,
      subdomain,
      url: config ? appUrl({ ...config, apps: { ...config.apps, [id]: { subdomain, enabled } } }, id) : null,
      workerName,
      workerDeployed,
      dashboardUrl: workerDashboardUrl(env.accountId, workerName),
      secrets,
    });
  }

  return statuses;
}

export interface SuiteOverview {
  configPresent: boolean;
  domain?: string;
  ownerEmail?: string;
  deployStage: string;
  accountId: string;
  cfTokenValid: boolean;
  apps: AppStatus[];
  inventory: CfInventory;
  dashboardLinks: {
    workers: string;
    d1: string;
    r2: string;
    observability: string;
    billing: string;
  };
}

export async function fetchSuiteOverview(env: CfEnv): Promise<SuiteOverview> {
  const config = loadConfig();
  const [apps, inventory] = await Promise.all([buildAppStatuses(env), fetchInventory(env)]);
  const accountId = env.accountId;
  const cfTokenValid = await verifyCfToken(env.apiToken, accountId);

  return {
    configPresent: Boolean(config),
    domain: config?.domain,
    ownerEmail: config?.ownerEmail,
    deployStage: resolveDeployStage(),
    accountId,
    cfTokenValid,
    apps,
    inventory,
    dashboardLinks: {
      workers: cfDashboardUrl(accountId, "/workers-and-pages"),
      d1: cfDashboardUrl(accountId, "/workers/d1"),
      r2: cfDashboardUrl(accountId, "/r2/overview"),
      observability: cfDashboardUrl(accountId, "/workers-and-pages/observability"),
      billing: cfDashboardUrl(accountId, "/billing"),
    },
  };
}
