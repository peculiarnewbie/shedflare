import { isAppSelected, loadConfig } from "./config.js";

function physicalName(stage: string | undefined, ...parts: string[]): string {
  const safeStage = (stage || "prod").toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
  return ["shedflare", safeStage, ...parts].join("-").replaceAll(/-+/g, "-");
}

export function resolveDeployStage(): string {
  return process.env.ALCHEMY_STAGE ?? "prod";
}

export function physicalWorkerName(appId: string, stage = resolveDeployStage()): string {
  return physicalName(stage, appId);
}

export function assertEnabledApp(appId: string): void {
  const config = loadConfig();
  if (!config) {
    throw new Error("shedflare.config.jsonc not found. Run `shedflare init` first.");
  }
  if (!isAppSelected(config, appId)) {
    throw new Error(`App "${appId}" is not selected in shedflare.config.jsonc.`);
  }
}
