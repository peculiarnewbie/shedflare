import { loadConfig, validateConfig } from "./config.js";
import { APP_IDS, loadManifest, type AppId } from "./manifests.js";
import { physicalWorkerName } from "./worker-names.js";
import * as wrangler from "./wrangler.js";

export interface MissingSecret {
  appId: string;
  names: string[];
}

export async function findMissingOperatorSecrets(apps: string[]): Promise<MissingSecret[]> {
  const missing: MissingSecret[] = [];

  for (const appId of apps) {
    if (!(APP_IDS as readonly string[]).includes(appId)) continue;

    const manifest = loadManifest(appId as AppId);
    const required = Object.entries(manifest.secrets)
      .filter(([_, def]) => def.required)
      .map(([name]) => name);
    if (required.length === 0) continue;

    const workerName = physicalWorkerName(appId);
    const present = await wrangler.listSecrets({ workerName });
    const absent = required.filter((name) => !present.includes(name));
    if (absent.length > 0) {
      missing.push({ appId, names: absent });
    }
  }

  return missing;
}

export function collectRequiredSecretNames(apps: string[]): string[] {
  const names = new Set<string>();
  for (const appId of apps) {
    if (!(APP_IDS as readonly string[]).includes(appId)) continue;
    const manifest = loadManifest(appId as AppId);
    for (const [name, def] of Object.entries(manifest.secrets)) {
      if (def.required) names.add(name);
    }
  }
  return [...names];
}

export function enabledAppIds(): string[] {
  const config = loadConfig();
  if (!config) return [];
  const validation = validateConfig(config);
  if (!validation.success) return [];
  return Object.entries(validation.value.apps)
    .filter(([id, entry]) => entry.enabled !== false && (APP_IDS as readonly string[]).includes(id))
    .map(([id]) => id);
}
