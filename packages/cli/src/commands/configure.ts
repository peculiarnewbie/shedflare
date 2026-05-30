import type { ShedflareConfig } from "../core/config.js";
import { loadConfig, validateConfig } from "../core/config.js";
import { APP_IDS, loadManifest } from "../core/manifests.js";
import type { AppManifest } from "../core/manifests.js";
import { writeAppFiles } from "../core/generate.js";
import { checkDrift } from "../core/validate.js";

export interface ConfigureOptions {
  check?: boolean;
  app?: string;
}

export async function configureCommand(options: ConfigureOptions): Promise<void> {
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

  if (options.check) {
    await runCheck(validConfig);
    return;
  }

  await runGenerate(validConfig, options.app);
}

async function runGenerate(config_: ShedflareConfig, appFilter?: string): Promise<void> {
  const manifests: Record<string, AppManifest> = {};
  for (const id of APP_IDS) {
    try {
      manifests[id] = loadManifest(id);
    } catch {
      console.warn(`[configure] Failed to load manifest for ${id}`);
    }
  }

  for (const [appId, appConfig] of Object.entries(config_.apps)) {
    if (!(APP_IDS as readonly string[]).includes(appId)) continue;
    if (!appConfig.enabled) continue;
    if (appFilter && appId !== appFilter) continue;

    const manifes = manifests[appId];
    if (!manifes) {
      console.warn(`  ⚠ Manifest for "${appId}" not found, skipping`);
      continue;
    }

    writeAppFiles(appId, manifes, config_, manifests, config_.resources);

    const subdomain = appConfig.subdomain;
    console.log(`  ✓ ${appId} → https://${subdomain}.${config_.domain}`);
  }

  console.log("\nDone. Generated wrangler.jsonc files for enabled apps.");
}

async function runCheck(config_: ShedflareConfig): Promise<void> {
  const drift = await checkDrift(config_);

  if (drift.hasDrift) {
    for (const diff of drift.diffs) {
      console.error(`\n── Drift in ${diff.appId} ──`);
      console.error("  Expected:");
      console.error(`  ${diff.expected.slice(0, 200).replace(/\n/g, "\n  ")}`);
      console.error("  Actual:");
      console.error(`  ${diff.actual.slice(0, 200).replace(/\n/g, "\n  ")}`);
    }
    process.exit(1);
  }

  console.log("All generated configs are up to date.");
}
