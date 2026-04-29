import spawn from "nano-spawn";
import { loadConfig, validateConfig } from "../core/config.js";
import { APP_IDS, loadManifest, hasD1Resource, getD1DatabaseName } from "../core/manifests.js";
import type { AppManifest } from "../core/manifests.js";
import { buildPlanFromConfig } from "../core/init-draft.js";
import { writeAppFiles } from "../core/generate.js";
import { checkDrift } from "../core/validate.js";
import { whoami, login, listSecrets } from "../core/wrangler.js";
import { askConfirm } from "../headless/prompts.js";

export interface DeployOptions {
  app?: string;
  verify?: boolean;
  yes?: boolean;
}

export async function deployCommand(options: DeployOptions): Promise<void> {
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

  if (options.app && !validConfig.apps[options.app]?.enabled) {
    console.error(`App "${options.app}" is not enabled in config.`);
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

  const plan = buildPlanFromConfig(validConfig, manifests);

  if (options.app) {
    plan.apps = plan.apps.filter((a) => a.id === options.app);
  }

  if (plan.apps.length === 0) {
    console.error("No enabled apps to deploy.");
    process.exit(1);
  }

  const appNames = plan.apps.map((a) => a.id).join(", ");

  // Auto-configure: regenerate wrangler.jsonc for all planned apps
  console.log("Regenerating wrangler configs...");
  for (const app of plan.apps) {
    writeAppFiles(app.id, app, validConfig, manifests, validConfig.resources);
  }

  // Pre-flight checks (skip if --yes)
  if (!options.yes) {
    // Wrangler login
    const user = await whoami();
    if (!user) {
      const shouldLogin = await askConfirm("Not logged in to Wrangler. Run `wrangler login`?");
      if (shouldLogin) {
        await login();
      } else {
        console.error("Cannot deploy without Wrangler login.");
        process.exit(1);
      }
    }

    // Config drift
    const drift = await checkDrift(validConfig);
    if (drift.hasDrift) {
      console.warn(`Warning: ${drift.diffs.length} app(s) have config drift.`);
    }

    // Secret check
    for (const app of plan.apps) {
      const requiredSecrets = Object.entries(app.secrets)
        .filter(([_, d]) => d.required)
        .map(([name]) => name);
      if (requiredSecrets.length === 0) continue;

      const setSecrets = await listSecrets({ cwd: `apps/${app.id}` });
      const missing = requiredSecrets.filter((s) => !setSecrets.includes(s));
      if (missing.length > 0) {
        console.warn(`Warning: ${app.id} is missing required secrets: ${missing.join(", ")}`);
      }
    }

    // Confirm
    const shouldDeploy = await askConfirm(`Deploy ${appNames} to ${validConfig.domain}?`);
    if (!shouldDeploy) {
      process.exit(0);
    }
  }

  // D1 migrations
  for (const app of plan.apps) {
    if (!hasD1Resource(app)) continue;
    const dbName = getD1DatabaseName(app);
    console.log(`Running D1 migrations for ${app.id} (${dbName})...`);
    try {
      await spawn("npm", ["run", "db:migrate"], { cwd: `apps/${app.id}` });
    } catch (error) {
      console.error(`D1 migration failed for ${app.id}:`, error);
      process.exit(1);
    }
  }

  // Deploy each app in dependency order
  const deployedApps: string[] = [];
  for (const app of plan.apps) {
    console.log(`Deploying ${app.id}...`);
    try {
      await spawn("npm", ["run", "deploy"], { cwd: `apps/${app.id}` });
      deployedApps.push(app.id);
    } catch (error) {
      console.error(`Deploy failed for ${app.id}:`, error);
      process.exit(1);
    }
  }

  // Verify URLs if requested
  if (options.verify) {
    console.log("\nVerifying URLs...");
    for (const app of plan.apps) {
      const appUrl = plan.urls[app.id];
      if (!appUrl) continue;
      try {
        const response = await fetch(appUrl, { method: "HEAD", redirect: "follow" });
        const status = response.ok ? "ok" : `${response.status}`;
        console.log(`  ${app.id}: ${status} (${appUrl})`);
      } catch {
        console.warn(`  ${app.id}: unreachable (${appUrl})`);
      }
    }
  }

  // Summary
  console.log("\nDeployed:");
  for (const appId of deployedApps) {
    const appUrl = plan.urls[appId] ?? "";
    console.log(`  ${appId}: ${appUrl}`);
  }

  console.log("\nNext steps:");
  console.log("  - Verify each app is accessible at its URL");
  console.log("  - Set any missing secrets via `wrangler secret put <NAME>` in the app directory");
}
