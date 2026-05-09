import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as Redacted from "effect/Redacted";
import { parse } from "jsonc-parser";

function loadEnvFiles(root: string) {
  for (const file of [".env", ".env.local"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf("=");
      if (sep === -1) continue;
      const key = trimmed.slice(0, sep).trim();
      let value = trimmed.slice(sep + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFiles(process.cwd());

export type AppId = "auth" | "chat" | "drive" | "money" | "youtube";

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

const SECRETS_CACHE = ".shedflare/secrets.json";

function readSecretsCache(root: string): Record<string, Record<string, string>> {
  const path = join(root, SECRETS_CACHE);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function writeSecretsCache(root: string, appId: AppId, name: string, value: string) {
  const path = join(root, SECRETS_CACHE);
  mkdirSync(dirname(path), { recursive: true });
  const cache = readSecretsCache(root);
  const app = (cache[appId] ??= {});
  app[name] = value;
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

export function requireSecretVar(appId: AppId, name: string): Redacted.Redacted<string> {
  const envKey = `SHEDFLARE_${appId.toUpperCase()}_${name}`;
  const fromEnv = process.env[envKey];
  if (fromEnv) {
    writeSecretsCache(process.cwd(), appId, name, fromEnv);
    return Redacted.make(fromEnv);
  }
  const cache = readSecretsCache(process.cwd());
  const cached = cache[appId]?.[name];
  if (cached) return Redacted.make(cached);
  throw new Error(
    `Missing ${appId} secret ${name}. Set ${envKey}=<value> and re-run.\n` +
      `After the first deploy, the value is cached locally so you won't need to set it again.`,
  );
}

export function physicalName(stage: string | undefined, ...parts: string[]): string {
  const safeStage = (stage || "dev").toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
  return ["shedflare", safeStage, ...parts].join("-").replaceAll(/-+/g, "-");
}
