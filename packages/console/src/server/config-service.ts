import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stageSubdomain } from "@shedflare/alchemy";
import { parse } from "jsonc-parser";
import { REPO_ROOT } from "./repo-root.ts";

const CONFIG_FILENAME = "shedflare.config.jsonc";

export interface AppEntry {
  enabled?: boolean;
  subdomain: string;
}

export interface ShedflareConfig {
  domain: string;
  ownerEmail: string;
  apps: Record<string, AppEntry>;
  vars?: Record<string, Record<string, string>>;
  resources?: Record<string, Record<string, string>>;
}

export interface ConfigPatch {
  domain?: string;
  ownerEmail?: string;
  apps?: Record<string, Partial<AppEntry>>;
  vars?: Record<string, Record<string, string>>;
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

export function configPath(): string {
  return path.join(REPO_ROOT, CONFIG_FILENAME);
}

export function loadConfig(): ShedflareConfig | null {
  const file = configPath();
  if (!existsSync(file)) return null;
  const parsed = parse(readFileSync(file, "utf8")) as ShedflareConfig | null;
  if (!parsed || typeof parsed !== "object") return null;
  parsed.vars ??= {};
  parsed.resources ??= {};
  return parsed;
}

export function formatConfig(config: ShedflareConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function writeConfigFile(file: string, config: ShedflareConfig): void {
  writeFileSync(file, formatConfig(config));
}

export function writeConfig(config: ShedflareConfig): void {
  writeConfigFile(configPath(), config);
}

export function discoverAppIds(): string[] {
  const appsDir = path.join(REPO_ROOT, "apps");
  if (!existsSync(appsDir)) return [];
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((id) => existsSync(path.join(appsDir, id, "shedflare.app.jsonc")))
    .sort();
}

export function loadManifest(appId: string): ManifestSummary | null {
  const file = path.join(REPO_ROOT, "apps", appId, "shedflare.app.jsonc");
  if (!existsSync(file)) return null;
  const raw = parse(readFileSync(file, "utf8")) as {
    id?: string;
    name?: string;
    description?: string;
    dependsOn?: string[];
    defaultSubdomain?: string;
    secrets?: Record<string, { description: string; required?: boolean }>;
    resources?: Array<{ type: string }>;
  };
  if (!raw || typeof raw !== "object") return null;
  return {
    id: raw.id ?? appId,
    name: raw.name ?? appId,
    description: raw.description ?? "",
    dependsOn: raw.dependsOn ?? [],
    defaultSubdomain: raw.defaultSubdomain ?? appId,
    secretNames: Object.keys(raw.secrets ?? {}),
    resourceTypes: (raw.resources ?? []).map((r) => r.type),
  };
}

export function appUrl(config: ShedflareConfig, appId: string, stage = "prod"): string | null {
  const entry = config.apps[appId];
  if (!entry || entry.enabled === false) return null;
  return `https://${stageSubdomain(entry.subdomain, stage)}.${config.domain}`;
}

export function mergeConfigPatch(current: ShedflareConfig, patch: ConfigPatch): ShedflareConfig {
  const next: ShedflareConfig = {
    ...current,
    apps: { ...current.apps },
    vars: { ...current.vars },
    resources: { ...current.resources },
  };
  if (patch.domain) next.domain = patch.domain;
  if (patch.ownerEmail) next.ownerEmail = patch.ownerEmail;
  if (patch.apps) {
    for (const [id, entry] of Object.entries(patch.apps)) {
      next.apps[id] = { ...next.apps[id], ...entry } as AppEntry;
    }
  }
  if (patch.vars) {
    for (const [id, vars] of Object.entries(patch.vars)) {
      next.vars![id] = { ...next.vars![id], ...vars };
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateDomain(value: unknown): string {
  if (typeof value !== "string") throw new Error("domain must be a string");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("domain cannot be empty");
  if (/^https?:\/\//.test(trimmed)) throw new Error("domain must not include a protocol");
  if (!/^[a-z0-9.-]+$/i.test(trimmed)) {
    throw new Error("domain may only contain letters, numbers, dots, and hyphens");
  }
  return trimmed.toLowerCase();
}

function validateOwnerEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error("ownerEmail must be a string");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("ownerEmail cannot be empty");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) throw new Error("ownerEmail must be an email");
  return trimmed;
}

function validateSubdomain(value: unknown): string {
  if (typeof value !== "string") throw new Error("subdomain must be a string");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("subdomain cannot be empty");
  if (!/^[a-z0-9-]+$/i.test(trimmed)) {
    throw new Error("subdomain may only contain letters, numbers, and hyphens");
  }
  if (trimmed.startsWith("-") || trimmed.endsWith("-")) {
    throw new Error("subdomain cannot start or end with a hyphen");
  }
  return trimmed.toLowerCase();
}

function validateAppPatch(value: unknown): Partial<AppEntry> {
  if (!isRecord(value)) throw new Error("app patch must be an object");
  const appPatch: Partial<AppEntry> = {};
  if ("enabled" in value) {
    if (typeof value.enabled !== "boolean") throw new Error("app enabled must be a boolean");
    appPatch.enabled = value.enabled;
  }
  if ("subdomain" in value) {
    appPatch.subdomain = validateSubdomain(value.subdomain);
  }
  return appPatch;
}

function validateVars(value: unknown): Record<string, string> {
  if (!isRecord(value)) throw new Error("vars must be an object");
  const vars: Record<string, string> = {};
  for (const [key, varValue] of Object.entries(value)) {
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new Error(`var name "${key}" must use uppercase letters, numbers, and underscores`);
    }
    if (typeof varValue !== "string") throw new Error(`var "${key}" must be a string`);
    vars[key] = varValue;
  }
  return vars;
}

export function validateConfigPatch(value: unknown): ConfigPatch {
  if (!isRecord(value)) throw new Error("config patch must be an object");

  const patch: ConfigPatch = {};
  if ("domain" in value) patch.domain = validateDomain(value.domain);
  if ("ownerEmail" in value) patch.ownerEmail = validateOwnerEmail(value.ownerEmail);

  if ("apps" in value) {
    if (!isRecord(value.apps)) throw new Error("apps must be an object");
    patch.apps = {};
    for (const [appId, appPatch] of Object.entries(value.apps)) {
      patch.apps[appId] = validateAppPatch(appPatch);
    }
  }

  if ("vars" in value) {
    if (!isRecord(value.vars)) throw new Error("vars must be an object");
    patch.vars = {};
    for (const [appId, vars] of Object.entries(value.vars)) {
      patch.vars[appId] = validateVars(vars);
    }
  }

  return patch;
}
