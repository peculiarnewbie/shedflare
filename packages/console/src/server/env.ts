import { loadConfig } from "./config-service.ts";
import { loadRepoDotEnv } from "./dotenv.ts";

export interface CfEnv {
  accountId: string;
  apiToken: string;
  zoneId?: string;
}

export class CfEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CfEnvError";
  }
}

export function resolveCfEnv(): CfEnv {
  loadRepoDotEnv();

  const token =
    process.env.CF_API_TOKEN ??
    process.env.SHEDFLARE_CF_BILL_CF_API_TOKEN ??
    process.env.CLOUDFLARE_API_TOKEN;

  if (!token) {
    throw new CfEnvError(
      "Missing CF_API_TOKEN (or CLOUDFLARE_API_TOKEN). Set it in your environment or .env at the repo root.",
    );
  }

  const config = loadConfig();
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    config?.vars?.["cf-bill"]?.CLOUDFLARE_ACCOUNT_ID ??
    config?.vars?.console?.CLOUDFLARE_ACCOUNT_ID;

  if (!accountId) {
    throw new CfEnvError(
      "Missing CLOUDFLARE_ACCOUNT_ID. Set it in the environment or vars.cf-bill.CLOUDFLARE_ACCOUNT_ID in shedflare.config.jsonc.",
    );
  }

  const zoneId =
    process.env.CLOUDFLARE_ZONE_ID ??
    config?.vars?.["cf-bill"]?.CLOUDFLARE_ZONE_ID ??
    config?.vars?.console?.CLOUDFLARE_ZONE_ID;

  return { accountId, apiToken: token, zoneId: zoneId || undefined };
}

export function resolveDeployStage(): string {
  return process.env.ALCHEMY_STAGE ?? "prod";
}

export function physicalWorkerName(appId: string, stage = resolveDeployStage()): string {
  const safeStage = stage.toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
  return ["shedflare", safeStage, appId].join("-").replaceAll(/-+/g, "-");
}

export function cfDashboardUrl(accountId: string, path: string): string {
  return `https://dash.cloudflare.com/${accountId}${path}`;
}

export function workerDashboardUrl(accountId: string, workerName: string): string {
  return cfDashboardUrl(
    accountId,
    `/workers/services/view/${encodeURIComponent(workerName)}/production`,
  );
}
