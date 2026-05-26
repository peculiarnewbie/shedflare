import { loadShedflareConfig, physicalName, type AppId } from "@shedflare/alchemy";

export function resolveDeployStage(): string {
  return process.env.ALCHEMY_STAGE ?? process.env.ALCHEMY_PROFILE ?? "dev";
}

export function physicalWorkerName(appId: string, stage = resolveDeployStage()): string {
  return physicalName(stage, appId);
}

export function assertEnabledApp(appId: string): void {
  const config = loadShedflareConfig();
  const app = config.apps[appId as AppId];
  if (!app || app.enabled === false) {
    throw new Error(`App "${appId}" is not enabled in shedflare.config.jsonc.`);
  }
}
