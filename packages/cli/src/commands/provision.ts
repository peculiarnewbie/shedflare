import { loadConfig, validateConfig, writeConfig } from "../core/config.js";
import { APP_IDS, loadManifest } from "../core/manifests.js";
import type { AppManifest } from "../core/manifests.js";
import { buildPlanFromConfig } from "../core/init-draft.js";
import { provisionResources } from "../core/provision.js";
import { writeAppFiles } from "../core/generate.js";

export interface ProvisionOptions {
  app?: string;
  mockResources?: boolean;
}

export async function provisionCommand(options: ProvisionOptions): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("shedflare.config.jsonc not found. Run `shedflare init` first.");
    process.exit(1);
  }

  const validation = validateConfig(config);
  if (!validation.success) {
    console.error("Invalid shedflare.config.jsonc:", validation.error);
    process.exit(1);
  }

  const validConfig = validation.value;

  if (options.app && !(APP_IDS as readonly string[]).includes(options.app)) {
    console.error(`Unknown app: ${options.app}`);
    process.exit(1);
  }

  const manifests: Record<string, AppManifest> = {};
  for (const id of APP_IDS) {
    try {
      manifests[id] = loadManifest(id);
    } catch {
      // skip unregistered apps
    }
  }

  const plan = buildPlanFromConfig(validConfig, manifests, options.mockResources ?? false);

  // Filter plan apps if --app specified
  if (options.app) {
    plan.apps = plan.apps.filter((a) => a.id === options.app);
  }

  console.log("Provisioning Cloudflare resources...");

  const existingIds = validConfig.resources;
  const result = await provisionResources(plan);

  // Count skipped resources
  let skippedCount = 0;
  for (const app of plan.apps) {
    for (const resource of app.resources) {
      if ("idField" in resource && existingIds[app.id]?.[resource.idField]) {
        skippedCount++;
      }
    }
  }
  if (skippedCount > 0) {
    console.log(`  ${skippedCount} resource(s) already provisioned, skipped`);
  }

  for (const warning of result.warnings) {
    console.warn(`  ⚠ ${warning}`);
  }

  // Merge new resource IDs into config
  let newCount = 0;
  for (const [appId, ids] of Object.entries(result.resourceIds)) {
    if (!validConfig.resources[appId]) {
      validConfig.resources[appId] = {};
    }
    for (const [key, value] of Object.entries(ids)) {
      if (validConfig.resources[appId][key] !== value) {
        validConfig.resources[appId][key] = value;
        newCount++;
      }
    }
  }

  if (newCount > 0) {
    writeConfig(validConfig);
    console.log(`  ${newCount} new resource ID(s) written to shedflare.config.jsonc`);
  }

  // Regenerate wrangler.jsonc for affected apps
  for (const app of plan.apps) {
    writeAppFiles(app.id, app, validConfig, manifests, validConfig.resources);
    console.log(`  ✓ ${app.id} wrangler.jsonc regenerated`);
  }

  console.log("\nDone.");
}
