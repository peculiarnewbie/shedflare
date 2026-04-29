import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import type { InitPlan } from "./init-draft.js";
import type { AppManifest, AppId } from "./manifests.js";
import { getWorkspaceRoot } from "./manifests.js";
import type { ShedflareConfig } from "./config.js";
import { mergeWranglerConfig } from "./template.js";
import { BASE_CONFIGS } from "./templates-data.js";

export function loadBaseConfig(appId: string): Record<string, unknown> {
  const appDir = join(getWorkspaceRoot(), "apps", appId);
  const basePath = join(appDir, "wrangler.base.jsonc");

  if (existsSync(basePath)) {
    const raw = readFileSync(basePath, "utf-8");
    return parse(raw) as Record<string, unknown>;
  }

  const embedded = BASE_CONFIGS[appId];
  if (embedded) {
    return JSON.parse(JSON.stringify(embedded)) as Record<string, unknown>;
  }

  throw new Error(`Base config for "${appId}" not found at ${basePath} or in embedded data`);
}

export function writeBaseConfig(appId: string): void {
  const embedded = BASE_CONFIGS[appId];
  if (!embedded) return;

  const appDir = join(getWorkspaceRoot(), "apps", appId);
  if (!existsSync(appDir)) {
    mkdirSync(appDir, { recursive: true });
  }

  const basePath = join(appDir, "wrangler.base.jsonc");
  writeFileSync(basePath, JSON.stringify(embedded, null, 2) + "\n");
}

export function writeAppFiles(
  appId: string,
  manifes: AppManifest,
  config: ShedflareConfig,
  manifests: Record<string, AppManifest>,
  resourceIds: Record<string, Record<string, string>>,
): void {
  const base = loadBaseConfig(appId);

  const merged = mergeWranglerConfig(
    base,
    appId as AppId,
    manifes,
    config,
    manifests as Record<AppId, AppManifest>,
    resourceIds as Record<AppId, Record<string, string>>,
  );

  const appDir = join(getWorkspaceRoot(), "apps", appId);
  const outputPath = join(appDir, "wrangler.jsonc");
  writeFileSync(outputPath, JSON.stringify(merged, null, 2) + "\n");
}

export function writeWorkspaceFiles(plan: InitPlan, config: ShedflareConfig): void {
  const root = getWorkspaceRoot();

  for (const app of plan.apps) {
    const appDir = join(root, "apps", app.id);
    if (!existsSync(appDir)) {
      mkdirSync(appDir, { recursive: true });
    }
    writeBaseConfig(app.id);
  }

  const manifests: Record<string, AppManifest> = {};
  for (const app of plan.apps) {
    manifests[app.id] = app;
  }

  for (const app of plan.apps) {
    writeAppFiles(app.id, app, config, manifests, plan.resourceIds);
  }

  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) {
    writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: "shedflare",
          private: true,
          scripts: {},
        },
        null,
        2,
      ) + "\n",
    );
  }
}
