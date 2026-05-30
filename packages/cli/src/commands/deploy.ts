import spawn from "nano-spawn";
import { loadConfig, validateConfig } from "../core/config.js";
import { APP_IDS, loadManifest, hasD1Resource, getD1DatabaseName } from "../core/manifests.js";
import type { AppManifest } from "../core/manifests.js";
import { buildPlanFromConfig } from "../core/init-draft.js";
import { writeAppFiles } from "../core/generate.js";
import { checkDrift } from "../core/validate.js";
import { whoami, login } from "../core/wrangler.js";
import { collectRequiredSecretNames, findMissingOperatorSecrets } from "../core/deploy-secrets.js";
import { askConfirm } from "../headless/prompts.js";
import {
  applySecretsToEnv,
  clearSecretsFromEnv,
  parseSecretFlags,
  promptMissingSecrets,
} from "./secret.js";

export interface DeployOptions {
  app?: string;
  verify?: boolean;
  yes?: boolean;
}

const ALCHEMY_STACKS: Record<string, { stack: string; buildClient?: string }> = {
  auth: { stack: "apps/auth/alchemy.run.ts" },
  chat: { stack: "apps/chat/alchemy.run.ts", buildClient: "apps/chat" },
  drive: { stack: "apps/drive/alchemy.run.ts", buildClient: "apps/drive" },
  money: { stack: "apps/money/alchemy.run.ts", buildClient: "apps/money" },
  youtube: { stack: "apps/youtube/alchemy.run.ts", buildClient: "apps/youtube" },
};

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
      console.warn(`[deploy] Failed to load manifest for ${id}`);
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
  const appIds = plan.apps.map((a) => a.id);

  console.log("Regenerating wrangler configs...");
  for (const app of plan.apps) {
    writeAppFiles(app.id, app, validConfig, manifests, validConfig.resources);
  }

  if (!options.yes) {
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

    const drift = await checkDrift(validConfig);
    if (drift.hasDrift) {
      console.warn(`Warning: ${drift.diffs.length} app(s) have config drift.`);
    }

    const missingOnCf = await findMissingOperatorSecrets(appIds);
    if (missingOnCf.length > 0) {
      for (const { appId, names } of missingOnCf) {
        console.warn(`Warning: ${appId} is missing secrets on Cloudflare: ${names.join(", ")}`);
      }
    }

    const shouldDeploy = await askConfirm(`Deploy ${appNames} to ${validConfig.domain}?`);
    if (!shouldDeploy) {
      process.exit(0);
    }
  }

  const flagSecrets = parseSecretFlags(process.argv.slice(2));
  const missingOnCf = await findMissingOperatorSecrets(appIds);
  const stillMissing: Array<{ appId: string; names: string[] }> = [];

  for (const entry of missingOnCf) {
    const names = entry.names.filter((name) => !process.env[name] && !flagSecrets[name]);
    if (names.length > 0) stillMissing.push({ appId: entry.appId, names });
  }

  let prompted: Record<string, string> = {};
  if (stillMissing.length > 0) {
    if (process.env.CI === "true" || process.env.CI === "1") {
      const flat = stillMissing.flatMap((e) => e.names.map((n) => `${e.appId}:${n}`));
      console.error(
        `Missing required secrets (set env vars or pass --secret=NAME=value): ${flat.join(", ")}`,
      );
      process.exit(1);
    }
    console.log("Provide values for secrets not yet on Cloudflare:");
    prompted = await promptMissingSecrets(stillMissing);
  }

  const injectedNames = collectRequiredSecretNames(appIds);
  applySecretsToEnv({ ...flagSecrets, ...prompted });

  try {
    for (const app of plan.apps) {
      if (!ALCHEMY_STACKS[app.id]) {
        console.error(`No Alchemy stack registered for app "${app.id}".`);
        process.exit(1);
      }

      if (hasD1Resource(app)) {
        const dbName = getD1DatabaseName(app);
        console.log(`Running D1 migrations for ${app.id} (${dbName})...`);
        try {
          await spawn("npm", ["run", "db:migrate"], { cwd: `apps/${app.id}` });
        } catch (error) {
          console.error(`D1 migration failed for ${app.id}:`, error);
          process.exit(1);
        }
      }

      const target = ALCHEMY_STACKS[app.id];
      if (target.buildClient) {
        console.log(`Building ${app.id} client...`);
        await spawn("vp", ["build", target.buildClient]);
      }

      console.log(`Deploying ${app.id} via Alchemy...`);
      await spawn("vp", ["exec", "alchemy", "deploy", target.stack, "--yes"]);
    }
  } finally {
    clearSecretsFromEnv(injectedNames);
  }

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

  console.log("\nDeployed:");
  for (const app of plan.apps) {
    console.log(`  ${app.id}: ${plan.urls[app.id] ?? ""}`);
  }

  console.log("\nRotate a secret without redeploying: shedflare secret set <app> <NAME>");
}
