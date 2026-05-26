import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { BUILTIN_MANIFESTS } from "./manifests-data.js";

export type AppId = "auth" | "cf-bill" | "chat" | "drive" | "money" | "youtube";

export const APP_IDS: AppId[] = ["auth", "cf-bill", "chat", "drive", "money", "youtube"];

export interface AppManifest {
  id: AppId;
  name: string;
  description: string;
  dependsOn: AppId[];
  defaultSubdomain: string;
  vars: Record<string, VarDef>;
  secrets: Record<string, SecretDef>;
  resources: ResourceDef[];
}

export interface VarDef {
  description: string;
  from: "url" | "appUrl" | "ownerEmail" | "user" | "appId";
  app?: AppId;
  default?: string;
}

export interface SecretDef {
  description: string;
  required: boolean;
}

export type ResourceDef =
  | { type: "kv"; binding: string; name: string; idField: string }
  | { type: "d1"; binding: string; name: string; idField: string }
  | { type: "r2"; binding: string; name: string }
  | { type: "durable_object"; binding: string }
  | { type: "browser"; binding: string; manualEnable: true };

export function getWorkspaceRoot(): string {
  return process.cwd();
}

function manifestPath(appId: AppId): string {
  return join(getWorkspaceRoot(), "apps", appId, "shedflare.app.jsonc");
}

export function loadManifest(appId: AppId): AppManifest {
  // Try filesystem first (workspace exists)
  const path = manifestPath(appId);
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf-8");
    const parsed = parse(raw) as AppManifest;
    if (parsed && typeof parsed === "object") {
      parsed.secrets ??= {};
      parsed.resources ??= [];
      return parsed;
    }
  }

  // Fall back to builtin data (no workspace yet, e.g. during init)
  const builtin = BUILTIN_MANIFESTS[appId];
  if (builtin) {
    return builtin;
  }

  throw new Error(`Manifest for "${appId}" not found at ${path} or in builtin data`);
}

export function getAllManifests(): AppManifest[] {
  return APP_IDS.map((id) => loadManifest(id));
}

export function isAppId(value: string): value is AppId {
  return (APP_IDS as readonly string[]).includes(value);
}

export function hasD1Resource(manifest: AppManifest): boolean {
  return manifest.resources.some((r) => r.type === "d1");
}

export function getD1DatabaseName(manifest: AppManifest): string | undefined {
  const d1 = manifest.resources.find((r) => r.type === "d1");
  return d1 ? d1.name : undefined;
}
