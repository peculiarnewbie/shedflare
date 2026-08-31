import {
  listWorkerSecretNames,
  loadCloudflareCredentials,
  type CfCredentials,
} from "@shedflare/alchemy";
import { APP_IDS, isAppId, loadManifest, getWorkspaceRoot } from "./manifests.js";
import { isAppSelected, loadConfig, validateConfig } from "./config.js";
import { physicalWorkerName } from "./worker-names.js";

export interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message?: string;
}

export async function runDoctor(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // Node.js version
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({
    name: "node-version",
    status: nodeMajor >= 22 ? "pass" : "fail",
    message:
      nodeMajor >= 22
        ? `Node.js ${process.versions.node}`
        : `Node.js ${process.versions.node} — need >= 22`,
  });

  let credentials: CfCredentials | null = null;
  try {
    credentials = await loadCloudflareCredentials();
    checks.push({
      name: "cloudflare-profile",
      status: "pass",
      message: `Alchemy Cloudflare profile for account ${credentials.accountId}`,
    });
  } catch (error) {
    checks.push({
      name: "cloudflare-profile",
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Config file
  const config = loadConfig();
  if (config) {
    const validation = validateConfig(config);
    checks.push({
      name: "config-valid",
      status: validation.success ? "pass" : "fail",
      message: validation.success ? undefined : validation.error,
    });
  } else {
    checks.push({
      name: "config-exists",
      status: "fail",
      message: "shedflare.config.jsonc not found",
    });
  }

  // App manifests
  for (const appId of APP_IDS) {
    try {
      loadManifest(appId);
      checks.push({
        name: `manifest-${appId}`,
        status: "pass",
        message: `apps/${appId}/shedflare.app.jsonc found`,
      });
    } catch {
      console.warn(`[validate] Failed to load manifest for ${appId}`);
      checks.push({
        name: `manifest-${appId}`,
        status: "fail",
        message: `apps/${appId}/shedflare.app.jsonc missing or invalid`,
      });
    }
  }

  // Alchemy stack files
  if (config) {
    for (const appId of Object.keys(config.apps)) {
      if (!isAppId(appId) || !isAppSelected(config, appId)) continue;

      const stackPath = `${getWorkspaceRoot()}/apps/${appId}/alchemy.run.ts`;
      const { existsSync } = await import("node:fs");
      checks.push({
        name: `stack-${appId}`,
        status: existsSync(stackPath) ? "pass" : "fail",
        message: existsSync(stackPath) ? undefined : `apps/${appId}/alchemy.run.ts missing`,
      });
    }
  }

  // Missing required secrets
  if (config && credentials) {
    const missingSecrets = await getMissingSecrets(config, credentials);
    if (missingSecrets.length > 0) {
      checks.push({
        name: "missing-secrets",
        status: "warn",
        message: `Apps with required secrets missing on Cloudflare Workers: ${missingSecrets.join(", ")}. Use shedflare secret set <app> <NAME>.`,
      });
    } else {
      checks.push({
        name: "missing-secrets",
        status: "pass",
      });
    }
  }

  return checks;
}

async function getMissingSecrets(
  config: import("./config.js").ShedflareConfig,
  credentials: CfCredentials,
): Promise<string[]> {
  const requireSecrets: string[] = [];

  for (const appId of Object.keys(config.apps)) {
    if (!isAppId(appId) || !isAppSelected(config, appId)) continue;

    try {
      const manifes = loadManifest(appId);
      const requiredSecrets = Object.entries(manifes.secrets)
        .filter(([, definition]) => definition.required && definition.source === "operator")
        .map(([name]) => name);
      if (requiredSecrets.length === 0) continue;

      const setSecrets = await listWorkerSecretNames(
        credentials,
        credentials.accountId,
        physicalWorkerName(appId),
      );
      const missing = requiredSecrets.filter((s) => !setSecrets.includes(s));
      if (missing.length > 0) {
        requireSecrets.push(appId);
      }
    } catch {
      console.warn(`[validate] Failed to check missing secrets for ${appId}`);
    }
  }

  return requireSecrets;
}
