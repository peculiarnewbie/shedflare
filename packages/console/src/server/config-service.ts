import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
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

export function writeConfig(config: ShedflareConfig): void {
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`);
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

export function appUrl(config: ShedflareConfig, appId: string): string | null {
  const entry = config.apps[appId];
  if (!entry || entry.enabled === false) return null;
  return `https://${entry.subdomain}.${config.domain}`;
}

export function mergeConfigPatch(
  current: ShedflareConfig,
  patch: {
    domain?: string;
    ownerEmail?: string;
    apps?: Record<string, Partial<AppEntry>>;
    vars?: Record<string, Record<string, string>>;
  },
): ShedflareConfig {
  const next: ShedflareConfig = {
    ...current,
    apps: { ...current.apps },
    vars: { ...(current.vars ?? {}) },
    resources: { ...(current.resources ?? {}) },
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
      next.vars![id] = { ...(next.vars![id] ?? {}), ...vars };
    }
  }
  return next;
}
