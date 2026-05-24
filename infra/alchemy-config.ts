import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";

export type AppId = "auth" | "cf-bill" | "chat" | "drive" | "money" | "youtube";

export interface ShedflareAlchemyConfig {
  domain: string;
  ownerEmail: string;
  apps: Partial<Record<AppId, { enabled?: boolean; subdomain: string }>>;
  vars?: Partial<Record<AppId, Record<string, string>>>;
}

export interface AppStackConfig {
  appId: AppId;
  domain: string;
  subdomain: string;
  url: string;
  ownerEmail: string;
  vars: Record<string, string>;
}

const CONFIG_FILENAME = "shedflare.config.jsonc";

export function loadShedflareConfig(root = process.cwd()): ShedflareAlchemyConfig {
  const configPath = join(root, CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    throw new Error(`${CONFIG_FILENAME} not found. Run \`shedflare init\` first.`);
  }

  const parsed = parse(readFileSync(configPath, "utf8")) as Partial<ShedflareAlchemyConfig>;
  if (!parsed || typeof parsed !== "object") throw new Error(`${CONFIG_FILENAME} is invalid.`);
  if (!parsed.domain) throw new Error(`${CONFIG_FILENAME} is missing "domain".`);
  if (!parsed.ownerEmail) throw new Error(`${CONFIG_FILENAME} is missing "ownerEmail".`);
  if (!parsed.apps) throw new Error(`${CONFIG_FILENAME} is missing "apps".`);

  return {
    domain: parsed.domain,
    ownerEmail: parsed.ownerEmail,
    apps: parsed.apps,
    vars: parsed.vars ?? {},
  };
}

export function appConfig(config: ShedflareAlchemyConfig, appId: AppId): AppStackConfig {
  const app = config.apps[appId];
  if (!app || app.enabled === false) throw new Error(`App "${appId}" is not enabled.`);

  const subdomain = app.subdomain;
  if (!subdomain) throw new Error(`App "${appId}" is missing a subdomain.`);

  return {
    appId,
    domain: config.domain,
    subdomain,
    url: `https://${subdomain}.${config.domain}`,
    ownerEmail: config.ownerEmail,
    vars: config.vars?.[appId] ?? {},
  };
}

export function requireVar(config: AppStackConfig, name: string): string {
  const value = config.vars[name] ?? process.env[`SHEDFLARE_${config.appId.toUpperCase()}_${name}`];
  if (!value) {
    throw new Error(
      `Missing ${config.appId} var ${name}. Set it in shedflare.config.jsonc vars.${config.appId}.${name} or SHEDFLARE_${config.appId.toUpperCase()}_${name}.`,
    );
  }
  return value;
}

export function physicalName(stage: string | undefined, ...parts: string[]): string {
  const safeStage = (stage || "dev").toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
  return ["shedflare", safeStage, ...parts].join("-").replaceAll(/-+/g, "-");
}
