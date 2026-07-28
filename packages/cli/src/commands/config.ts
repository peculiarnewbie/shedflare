import { readFileSync } from "node:fs";
import {
  discoverManifests,
  findRepoRoot,
  inspectConfig,
  migrateConfig,
  writeConfigMigration,
} from "@shedflare/core";
import { askConfirm } from "../headless/prompts.js";

export interface ConfigMigrateOptions {
  check?: boolean;
  write?: boolean;
  yes?: boolean;
  json?: boolean;
}

export async function configMigrateCommand(options: ConfigMigrateOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  const catalog = discoverManifests(root);
  const inspection = inspectConfig(root, catalog);
  if (!inspection.config) {
    throw new Error("shedflare.config.jsonc not found. Nothing to migrate.");
  }

  const sourceText = readFileSync(inspection.configPath, "utf8");
  const migration = migrateConfig(inspection.config, catalog, inspection.configPath, sourceText);
  const result = {
    oldVersion: migration.oldVersion,
    newVersion: 2,
    canWrite: migration.canWrite,
    warnings: migration.warnings,
    diff: migration.diff,
  };

  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const warning of migration.warnings) console.warn(`Warning: ${warning.message}`);
    console.log(migration.diff);
  }

  if (options.check) {
    if (migration.oldVersion !== 2 || !migration.canWrite) process.exitCode = 1;
    return;
  }
  if (!options.write) return;
  if (!migration.canWrite) throw new Error("Migration cannot be written while warnings remain.");

  if (!options.yes) {
    const confirmed = await askConfirm("Write this migration and create a local backup?");
    if (!confirmed) return;
  }
  writeConfigMigration(migration, catalog);
  if (!options.json) console.log("Migrated shedflare.config.jsonc to version 2.");
}
