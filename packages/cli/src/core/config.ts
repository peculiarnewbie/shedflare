import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import {
  type InferOutput,
  boolean,
  object,
  optional,
  record,
  string,
  parse as vParse,
} from "valibot";
import { isAppId, getWorkspaceRoot } from "./manifests.js";

const AppEntrySchema = object({
  enabled: optional(boolean(), true),
  subdomain: string(),
});

const ShedflareConfigSchema = object({
  domain: string(),
  ownerEmail: string(),
  apps: record(string(), AppEntrySchema),
  vars: record(string(), record(string(), string())),
  resources: record(string(), record(string(), string())),
});

export type ShedflareConfig = InferOutput<typeof ShedflareConfigSchema>;

export interface AppEntry {
  enabled: boolean;
  subdomain: string;
}

const CONFIG_FILENAME = "shedflare.config.jsonc";

export function configPath(): string {
  return join(getWorkspaceRoot(), CONFIG_FILENAME);
}

export function exampleConfigPath(): string {
  return join(getWorkspaceRoot(), "shedflare.config.example.jsonc");
}

export function loadConfig(): ShedflareConfig | null {
  const path = configPath();
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  const parsed = parse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as ShedflareConfig;
}

export function validateConfig(
  config: unknown,
): { success: true; value: ShedflareConfig } | { success: false; error: string } {
  try {
    const value = vParse(ShedflareConfigSchema, config);
    const badApp = Object.keys(value.apps).find((k) => !isAppId(k));
    if (badApp) {
      return { success: false, error: `Unknown app "${badApp}" in config` };
    }
    return { success: true, value };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function writeConfig(config: ShedflareConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + "\n");
}
