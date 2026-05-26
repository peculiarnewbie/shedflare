import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { getWorkspaceRoot } from "./manifests.js";

function physicalName(stage: string | undefined, ...parts: string[]): string {
  const safeStage = (stage || "dev").toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
  return ["shedflare", safeStage, ...parts].join("-").replaceAll(/-+/g, "-");
}

export function resolveDeployStage(): string {
  return process.env.ALCHEMY_STAGE ?? process.env.ALCHEMY_PROFILE ?? "dev";
}

export function physicalWorkerName(appId: string, stage = resolveDeployStage()): string {
  return physicalName(stage, appId);
}

export function assertEnabledApp(appId: string): void {
  const configPath = join(getWorkspaceRoot(), "shedflare.config.jsonc");
  if (!existsSync(configPath)) {
    throw new Error("shedflare.config.jsonc not found. Run `shedflare init` first.");
  }

  const config = parse(readFileSync(configPath, "utf-8")) as {
    apps?: Record<string, { enabled?: boolean }>;
  };
  const app = config.apps?.[appId];
  if (!app || app.enabled === false) {
    throw new Error(`App "${appId}" is not enabled in shedflare.config.jsonc.`);
  }
}
