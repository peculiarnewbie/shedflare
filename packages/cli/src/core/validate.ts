import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import type { AppId } from "./manifests.js";
import { APP_IDS, loadManifest, getWorkspaceRoot } from "./manifests.js";
import { loadConfig, validateConfig } from "./config.js";
import { mergeWranglerConfig } from "./template.js";
import { loadBaseConfig } from "./generate.js";
import * as wrangler from "./wrangler.js";

export interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message?: string;
}

export interface DriftReport {
  hasDrift: boolean;
  diffs: Array<{ appId: string; expected: string; actual: string }>;
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

  // Wrangler login
  const user = await wrangler.whoami();
  checks.push({
    name: "wrangler-login",
    status: user ? "pass" : "fail",
    message: user ? `Logged in as ${user.email}` : "Not logged in — run `wrangler login`",
  });

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
      checks.push({
        name: `manifest-${appId}`,
        status: "fail",
        message: `apps/${appId}/shedflare.app.jsonc missing or invalid`,
      });
    }
  }

  // Wrangler base configs
  for (const appId of APP_IDS) {
    try {
      loadBaseConfig(appId);
      checks.push({
        name: `base-${appId}`,
        status: "pass",
      });
    } catch {
      checks.push({
        name: `base-${appId}`,
        status: "fail",
        message: `Could not load base config for ${appId}`,
      });
    }
  }

  // Config drift
  if (config) {
    const drift = await checkDrift(config);
    if (drift.hasDrift) {
      checks.push({
        name: "config-drift",
        status: "fail",
        message: `${drift.diffs.length} app(s) have drifted from generated config`,
      });
    } else {
      checks.push({
        name: "config-drift",
        status: "pass",
      });
    }
  }

  // Missing required secrets
  if (config) {
    const missingSecrets = getMissingSecrets(config);
    if (missingSecrets.length > 0) {
      checks.push({
        name: "missing-secrets",
        status: "warn",
        message: `Apps with required secrets that need to be set via 'wrangler secret put': ${missingSecrets.join(", ")}`,
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

export async function checkDrift(
  config: import("./config.js").ShedflareConfig,
): Promise<DriftReport> {
  const diffs: DriftReport["diffs"] = [];

  for (const [appId, appConfig] of Object.entries(config.apps)) {
    if (!(APP_IDS as readonly string[]).includes(appId) || !appConfig.enabled) continue;

    try {
      const manifes = loadManifest(appId as AppId);
      const base = loadBaseConfig(appId);

      const manifests: Record<string, import("./manifests.js").AppManifest> = {};
      for (const id of APP_IDS) {
        manifests[id] = loadManifest(id);
      }

      const expected = mergeWranglerConfig(
        base,
        appId as AppId,
        manifes,
        config,
        manifests as Record<AppId, import("./manifests.js").AppManifest>,
        config.resources as Record<AppId, Record<string, string>>,
      );

      const actualPath = join(getWorkspaceRoot(), "apps", appId, "wrangler.jsonc");
      const actualRaw = existsSync(actualPath) ? readFileSync(actualPath, "utf-8") : "";
      const actual = actualRaw ? (parse(actualRaw) as Record<string, unknown>) : null;

      const expectedStr = JSON.stringify(expected, null, 2);
      const actualStr = actual ? JSON.stringify(actual, null, 2) : "(missing)";

      if (expectedStr !== actualStr) {
        diffs.push({
          appId,
          expected: expectedStr,
          actual: actualStr,
        });
      }
    } catch {
      diffs.push({ appId, expected: "(error computing)", actual: "(error reading)" });
    }
  }

  return { hasDrift: diffs.length > 0, diffs };
}

function getMissingSecrets(config: import("./config.js").ShedflareConfig): string[] {
  const requireSecrets: string[] = [];

  for (const [appId, appConfig] of Object.entries(config.apps)) {
    if (!(APP_IDS as readonly string[]).includes(appId) || !appConfig.enabled) continue;

    try {
      const manifes = loadManifest(appId as AppId);
      const hasRequired = Object.values(manifes.secrets).some((d) => d.required);
      if (hasRequired && !hasAccessedWranglerSecrets(appId)) {
        requireSecrets.push(appId);
      }
    } catch {
      // skip
    }
  }

  return requireSecrets;
}

function hasAccessedWranglerSecrets(_appId: string): boolean {
  // Placeholder: secrets are set via wrangler at deploy time, not stored in config.
  // A future enhancement could verify via `wrangler secret list` in the app directory.
  // For now, always return false so the doctor check flags apps with required secrets.
  return false;
}
