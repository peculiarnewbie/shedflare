import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";

export type AppId =
  | "anki"
  | "auth"
  | "cf-bill"
  | "chat"
  | "drive"
  | "homepage"
  | "money"
  | "observability"
  | "routines"
  | "s"
  | "youtube";

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
  configuredSubdomain: string;
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

function safeStageSuffix(stage: string): string {
  return stage
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "-")
    .replaceAll(/-+/g, "-");
}

export function stageSubdomain(subdomain: string, stage: string): string {
  if (stage === "prod") return subdomain;
  const suffix = safeStageSuffix(stage);
  if (!suffix) return subdomain;
  return `${subdomain}-${suffix}`;
}

export function appStackConfig(
  config: ShedflareAlchemyConfig,
  appId: AppId,
  stage = "prod",
): AppStackConfig {
  const app = config.apps[appId];
  if (!app || app.enabled === false) throw new Error(`App "${appId}" is not enabled.`);

  const configuredSubdomain = app.subdomain;
  if (!configuredSubdomain) throw new Error(`App "${appId}" is missing a subdomain.`);
  const subdomain = stageSubdomain(configuredSubdomain, stage);

  return {
    appId,
    domain: config.domain,
    subdomain,
    configuredSubdomain,
    url: `https://${subdomain}.${config.domain}`,
    ownerEmail: config.ownerEmail,
    vars: config.vars?.[appId] ?? {},
  };
}

export function requireVar(config: AppStackConfig, name: string): string {
  const fromConfig = config.vars[name];
  if (fromConfig) return fromConfig;

  const envName = `SHEDFLARE_${config.appId.toUpperCase().replaceAll("-", "_")}_${name}`;
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;

  throw new Error(
    `Missing ${config.appId} var ${name}. Set vars.${config.appId}.${name} in shedflare.config.jsonc or ${envName}.`,
  );
}

export function optionalVar(config: AppStackConfig, name: string, fallback = ""): string {
  return (
    config.vars[name] ??
    process.env[`SHEDFLARE_${config.appId.toUpperCase().replaceAll("-", "_")}_${name}`] ??
    fallback
  );
}
