import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ManifestCatalog } from "../manifests/model.ts";
import { validateConfig } from "./load.ts";
import type { ConfigMigration, ShedflareConfig, ShedflareConfigV2 } from "./model.ts";

const CONFIG_SCHEMA_PATH = "https://shedflare.dev/schemas/shedflare-config.schema.json";

function withSourceText(
  migration: ConfigMigration,
  sourceText: string | undefined,
): ConfigMigration {
  return sourceText === undefined ? migration : { ...migration, sourceText };
}

function configText(config: ShedflareConfigV2): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function migrationDiff(oldVersion: number, config: ShedflareConfigV2): string {
  return `--- shedflare.config.jsonc (version ${oldVersion})\n+++ shedflare.config.jsonc (version 2)\n${configText(config)}`;
}

export function migrateConfig(
  input: ShedflareConfig,
  catalog: ManifestCatalog,
  sourcePath = "shedflare.config.jsonc",
  sourceText?: string,
): ConfigMigration {
  if (input.configVersion === 2) {
    const migration = {
      sourcePath,
      oldVersion: 2,
      config: input,
      warnings: [],
      diff: migrationDiff(2, input),
      canWrite: true,
    } satisfies ConfigMigration;
    return withSourceText(migration, sourceText);
  }

  const apps: Record<string, { subdomain?: string; vars?: Record<string, string> }> = {};
  for (const [appId, selection] of Object.entries(input.apps)) {
    if (selection.enabled === false) continue;
    const manifest = catalog.manifests.get(appId);
    if (!manifest) continue;
    const vars = input.vars[appId];
    const app: (typeof apps)[string] = {};
    if (selection.subdomain !== manifest.defaultSubdomain) app.subdomain = selection.subdomain;
    if (vars && Object.keys(vars).length > 0) app.vars = { ...vars };
    apps[appId] = app;
  }

  const config: ShedflareConfigV2 = {
    $schema: CONFIG_SCHEMA_PATH,
    configVersion: 2,
    domain: input.domain,
    ownerEmail: input.ownerEmail,
    apps,
  };
  validateConfig(config, catalog);

  const hasLegacyResources = Object.values(input.resources).some(
    (resources) => Object.keys(resources).length > 0,
  );
  const warnings = hasLegacyResources
    ? [
        {
          code: "LEGACY_RESOURCES_PRESENT" as const,
          message:
            "Legacy resources contain values and will not be discarded automatically. Remove or resolve them before writing the migration.",
        },
      ]
    : [];

  const migration = {
    sourcePath,
    oldVersion: 1,
    config,
    warnings,
    diff: migrationDiff(1, config),
    canWrite: warnings.length === 0,
  } satisfies ConfigMigration;
  return withSourceText(migration, sourceText);
}

export function writeConfigMigration(migration: ConfigMigration, catalog: ManifestCatalog): string {
  if (!migration.canWrite) {
    throw new Error(migration.warnings.map((warning) => warning.message).join("\n"));
  }

  const original =
    migration.sourceText ??
    (existsSync(migration.sourcePath) ? readFileSync(migration.sourcePath, "utf8") : undefined);
  if (original !== undefined) {
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    writeFileSync(`${migration.sourcePath}.${stamp}.bak`, original);
  }

  const next = configText(migration.config);
  validateConfig(JSON.parse(next), catalog);
  const temporaryPath = join(
    dirname(migration.sourcePath),
    `.${basename(migration.sourcePath)}.${process.pid}.tmp`,
  );
  writeFileSync(temporaryPath, next);
  renameSync(temporaryPath, migration.sourcePath);
  return migration.sourcePath;
}
