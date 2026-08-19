import spawn from "nano-spawn";
import { loadRepoDotEnv } from "@shedflare/alchemy";
import { isAppSelected, loadConfig, validateConfig } from "../core/config.js";
import { isAppId, loadManifest, type AppId } from "../core/manifests.js";
import { whoami, login } from "../core/wrangler.js";
import { physicalWorkerName } from "../core/worker-names.js";
import * as wrangler from "../core/wrangler.js";
import { askConfirm } from "../headless/prompts.js";
import {
  parseSecretFlags,
  promptMissingSecrets,
  applySecretsToEnv,
  clearSecretsFromEnv,
} from "./secret.js";

export interface DeployOptions {
  app?: string;
  yes?: boolean;
}

export async function deployCommand(options: DeployOptions): Promise<void> {
  loadRepoDotEnv();

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

  let selectedApp: AppId | undefined;
  if (options.app) {
    if (!isAppId(options.app)) {
      console.error(`Unknown app: ${options.app}`);
      process.exit(1);
    } else {
      selectedApp = options.app;
    }
  }

  if (options.app && !isAppSelected(validConfig, options.app)) {
    console.error(`App "${options.app}" is not enabled in config.`);
    process.exit(1);
  }

  const appIds: AppId[] = selectedApp
    ? [selectedApp]
    : Object.keys(validConfig.apps)
        .filter((id) => isAppSelected(validConfig, id))
        .filter(isAppId);

  if (appIds.length === 0) {
    console.error("No enabled apps to deploy.");
    process.exit(1);
  }

  // Check wrangler login
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
  }

  // Check missing secrets
  const missingOnCf: Array<{ appId: string; names: string[] }> = [];
  for (const appId of appIds) {
    try {
      const manifest = loadManifest(appId);
      const requiredSecrets = Object.entries(manifest.secrets)
        .filter(([, definition]) => definition.required && definition.source === "operator")
        .map(([name]) => name);
      if (requiredSecrets.length === 0) continue;

      const setSecrets = await wrangler.listSecrets({
        workerName: physicalWorkerName(appId),
      });
      const missing = requiredSecrets.filter((s) => !setSecrets.includes(s));
      if (missing.length > 0) {
        missingOnCf.push({ appId, names: missing });
      }
    } catch {
      console.warn(`[deploy] Failed to check secrets for ${appId}`);
    }
  }

  // Parse --secret flags
  const flagSecrets = parseSecretFlags(process.argv.slice(2));

  // Filter out secrets that are already provided via flags
  const stillMissing = missingOnCf
    .map((entry) => ({
      appId: entry.appId,
      names: entry.names.filter((n) => !flagSecrets[n] && !process.env[n]),
    }))
    .filter((entry) => entry.names.length > 0);

  let prompted: Record<string, string> = {};
  if (stillMissing.length > 0) {
    if (process.env.CI === "true" || process.env.CI === "1") {
      const flat = stillMissing.flatMap((e) => e.names.map((n) => `${e.appId}:${n}`));
      console.error(`Missing required secrets (set as environment variables): ${flat.join(", ")}`);
      process.exit(1);
    }
    console.log("Provide values for secrets not yet on Cloudflare:");
    prompted = await promptMissingSecrets(stillMissing);
  }

  // Collect all secret names we might have injected
  const allRequiredSecrets = new Set<string>();
  for (const appId of appIds) {
    try {
      const manifest = loadManifest(appId);
      for (const [name, definition] of Object.entries(manifest.secrets)) {
        if (definition.source === "operator") allRequiredSecrets.add(name);
      }
    } catch {
      /* ignore */
    }
  }

  applySecretsToEnv({ ...flagSecrets, ...prompted });

  try {
    const target = options.app ? `apps/${options.app}/alchemy.run.ts` : "alchemy.run.ts";

    console.log(`Deploying via Alchemy: ${target}...`);
    await spawn("vp", ["exec", "alchemy", "deploy", target, "--stage", "prod", "--yes"], {
      stdio: "inherit",
    });
  } finally {
    clearSecretsFromEnv([...allRequiredSecrets]);
  }
}
