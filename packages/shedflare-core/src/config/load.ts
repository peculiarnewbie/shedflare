import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getDotPath, safeParse } from "valibot";
import { CoreError } from "../errors.ts";
import { parseJsonc } from "../jsonc.ts";
import type { ManifestCatalog } from "../manifests/model.ts";
import { configPath } from "../paths.ts";
import type {
  AppSelection,
  ConfigInspection,
  LegacyAppSelection,
  ShedflareConfig,
  ShedflareConfigV1,
  ShedflareConfigV2,
} from "./model.ts";
import { ShedflareConfigV1Schema, ShedflareConfigV2Schema } from "./schema.ts";

function parseConfigVersionOne(input: unknown): ShedflareConfigV1 {
  const result = safeParse(ShedflareConfigV1Schema, input);
  if (!result.success) {
    const issue = result.issues[0];
    const fieldPath = getDotPath(issue) ?? undefined;
    throw new CoreError("CONFIG_INVALID", `${fieldPath ? `${fieldPath}: ` : ""}${issue.message}`, {
      fieldPath,
      expectation: issue.expected ?? undefined,
    });
  }

  const config = result.output;
  return {
    ...(config.$schema === undefined ? {} : { $schema: config.$schema }),
    configVersion: 1,
    domain: config.domain,
    ownerEmail: config.ownerEmail,
    apps: Object.fromEntries(
      Object.entries(config.apps).map(([appId, selection]) => [
        appId,
        {
          ...(selection.enabled === undefined ? {} : { enabled: selection.enabled }),
          subdomain: selection.subdomain,
        } satisfies LegacyAppSelection,
      ]),
    ),
    vars: Object.fromEntries(
      Object.entries(config.vars ?? {}).map(([appId, vars]) => [appId, { ...vars }]),
    ),
    resources: Object.fromEntries(
      Object.entries(config.resources ?? {}).map(([appId, resources]) => [appId, { ...resources }]),
    ),
  };
}

function parseConfigVersionTwo(input: unknown): ShedflareConfigV2 {
  const result = safeParse(ShedflareConfigV2Schema, input);
  if (!result.success) {
    const issue = result.issues[0];
    const fieldPath = getDotPath(issue) ?? undefined;
    throw new CoreError("CONFIG_INVALID", `${fieldPath ? `${fieldPath}: ` : ""}${issue.message}`, {
      fieldPath,
      expectation: issue.expected ?? undefined,
    });
  }

  const config = result.output;
  return {
    ...(config.$schema === undefined ? {} : { $schema: config.$schema }),
    configVersion: 2,
    domain: config.domain,
    ownerEmail: config.ownerEmail,
    apps: Object.fromEntries(
      Object.entries(config.apps).map(([appId, selection]) => [
        appId,
        {
          ...(selection.subdomain === undefined ? {} : { subdomain: selection.subdomain }),
          ...(selection.vars === undefined ? {} : { vars: { ...selection.vars } }),
        } satisfies AppSelection,
      ]),
    ),
  };
}

function assertKnownApps(config: ShedflareConfig, catalog: ManifestCatalog): void {
  const appIds = new Set<string>(Object.keys(config.apps));
  if (config.configVersion === 1) {
    for (const appId of Object.keys(config.vars)) appIds.add(appId);
    for (const appId of Object.keys(config.resources)) appIds.add(appId);
  }

  for (const appId of appIds) {
    if (!catalog.manifests.has(appId)) {
      throw new CoreError(
        "CONFIG_UNKNOWN_APP",
        `Unknown app "${appId}" in config. Regenerate the registry if this app was added, or remove stale config.`,
        { fieldPath: `apps.${appId}` },
      );
    }
  }
}

function versionDisplay(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

export function validateConfig(input: unknown, catalog: ManifestCatalog): ShedflareConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CoreError("CONFIG_INVALID", "Config must be an object.");
  }

  const versionValue = "configVersion" in input ? input.configVersion : undefined;
  if (versionValue !== undefined && versionValue !== 2) {
    throw new CoreError(
      "CONFIG_VERSION_UNSUPPORTED",
      `Unsupported configVersion ${versionDisplay(versionValue)}. Supported versions are 1 and 2.`,
      { fieldPath: "configVersion" },
    );
  }

  const config = versionValue === 2 ? parseConfigVersionTwo(input) : parseConfigVersionOne(input);
  assertKnownApps(config, catalog);
  return config;
}

export function inspectConfig(root: string, catalog: ManifestCatalog): ConfigInspection {
  const path = configPath(root);
  if (!existsSync(path)) return { configPath: path, present: false, warnings: [] };

  const source = readFileSync(path, "utf8");
  const config = validateConfig(parseJsonc(source, path, "CONFIG_PARSE_ERROR"), catalog);
  return {
    configPath: path,
    present: true,
    config,
    warnings:
      config.configVersion === 1
        ? ["Config version 1 is readable but should be migrated explicitly to version 2."]
        : [],
  };
}

export function loadConfig(root: string, catalog: ManifestCatalog): ShedflareConfig {
  const inspection = inspectConfig(root, catalog);
  if (!inspection.config) {
    throw new CoreError(
      "CONFIG_NOT_FOUND",
      `${inspection.configPath} not found. Run \`shedflare init\` or set up the Console first.`,
      { filePath: inspection.configPath },
    );
  }
  return inspection.config;
}

export function writeConfig(
  root: string,
  config: ShedflareConfigV2,
  catalog: ManifestCatalog,
): void {
  const validated = validateConfig(config, catalog);
  if (validated.configVersion !== 2) {
    throw new CoreError("CONFIG_VERSION_UNSUPPORTED", "New config writes require version 2.");
  }
  writeFileSync(configPath(root), `${JSON.stringify(validated, null, 2)}\n`);
}
