import type { AppId, AppManifest } from "./manifests.js";
import { APP_IDS } from "./manifests.js";
import type { ShedflareConfig } from "./config.js";

export interface InitOptions {
  apps?: string;
  ownerEmail?: string;
  domain?: string;
  yes?: boolean;
  mockResources?: boolean;
  tui?: boolean;
}

export interface InitDraft {
  apps: AppId[];
  ownerEmail: string;
  domain: string;
  subdomains: Record<string, string>;
  vars: Record<string, Record<string, string>>;
  secrets: Record<string, Record<string, string>>;
  mockResources: boolean;
}

export interface InitPlan {
  apps: AppManifest[];
  deployOrder: AppId[];
  urls: Record<string, string>;
  resourceIds: Record<string, Record<string, string>>;
  resolvedVars: Record<string, Record<string, string>>;
  resolvedSecrets: Record<string, Record<string, string>>;
  mockResources: boolean;
}

export function createDraft(inputs: InitOptions): InitDraft {
  let selectedApps: AppId[];

  if (inputs.apps) {
    const raw = inputs.apps.split(",").map((s) => s.trim());
    const unknown = raw.filter((a) => !(APP_IDS as readonly string[]).includes(a));
    if (unknown.length > 0) {
      throw new Error(`Unknown app(s): ${unknown.join(", ")}. Valid apps: ${APP_IDS.join(", ")}`);
    }
    selectedApps = raw as AppId[];
  } else {
    selectedApps = [...APP_IDS];
  }

  return {
    apps: selectedApps,
    ownerEmail: inputs.ownerEmail ?? "",
    domain: inputs.domain ?? "",
    subdomains: {},
    vars: {},
    secrets: {},
    mockResources: inputs.mockResources ?? false,
  };
}

export function validateDraft(
  draft: InitDraft,
): { valid: true; draft: InitDraft } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (draft.apps.length === 0) {
    errors.push("At least one app must be selected");
  }
  if (!draft.ownerEmail) {
    errors.push("Owner email is required");
  }
  if (!draft.domain) {
    errors.push("Domain is required");
  }

  return errors.length === 0 ? { valid: true, draft } : { valid: false, errors };
}

export function createPlan(draft: InitDraft, manifests: Record<string, AppManifest>): InitPlan {
  const deployOrder = computeDeployOrder(draft.apps, manifests);

  // First pass: compute URLs for ALL apps so cross-app URL refs resolve
  // regardless of iteration order
  const urls: Record<string, string> = {};
  for (const appId of draft.apps) {
    const subdomain = draft.subdomains[appId] ?? manifests[appId].defaultSubdomain;
    urls[appId] = `https://${subdomain}.${draft.domain}`;
  }

  const resourceIds: Record<string, Record<string, string>> = {};
  const resolvedVars: Record<string, Record<string, string>> = {};
  const resolvedSecrets: Record<string, Record<string, string>> = {};

  for (const appId of draft.apps) {
    resourceIds[appId] = {};

    const vars = manifests[appId].vars ?? {};
    const appVars: Record<string, string> = {};
    for (const [key, def] of Object.entries(vars)) {
      switch (def.from) {
        case "url":
          appVars[key] = urls[appId];
          break;
        case "appUrl": {
          const target = def.app ?? appId;
          if (!urls[target]) {
            throw new Error(
              `App "${appId}" requires URL of "${target}" which is not in the selected apps`,
            );
          }
          appVars[key] = urls[target];
          break;
        }
        case "ownerEmail":
          appVars[key] = draft.ownerEmail;
          break;
        case "appId":
          appVars[key] = `shedflare-${appId}`;
          break;
        case "user":
          appVars[key] = draft.vars[appId]?.[key] ?? def.default ?? "";
          break;
      }
    }
    resolvedVars[appId] = appVars;

    const secrets = manifests[appId].secrets ?? {};
    const appSecrets: Record<string, string> = {};
    for (const key of Object.keys(secrets)) {
      appSecrets[key] = draft.secrets[appId]?.[key] ?? "";
    }
    resolvedSecrets[appId] = appSecrets;
  }

  return {
    apps: draft.apps.map((id) => manifests[id]),
    deployOrder,
    urls,
    resourceIds,
    resolvedVars,
    resolvedSecrets,
    mockResources: draft.mockResources,
  };
}

export function buildPlanFromConfig(
  config: ShedflareConfig,
  manifests: Record<string, AppManifest>,
  mockResources = false,
): InitPlan {
  const enabledAppIds = Object.entries(config.apps)
    .filter(([_, entry]) => entry.enabled)
    .map(([id]) => id as AppId);

  const deployOrder = computeDeployOrder(enabledAppIds, manifests);

  const urls: Record<string, string> = {};
  for (const appId of enabledAppIds) {
    const subdomain = config.apps[appId].subdomain;
    urls[appId] = `https://${subdomain}.${config.domain}`;
  }

  const resourceIds: Record<string, Record<string, string>> = {};
  for (const [appId, ids] of Object.entries(config.resources)) {
    resourceIds[appId] = { ...ids };
  }

  const resolvedVars: Record<string, Record<string, string>> = {};
  const resolvedSecrets: Record<string, Record<string, string>> = {};

  for (const appId of enabledAppIds) {
    const manifest = manifests[appId];
    if (!manifest) continue;

    const appVars: Record<string, string> = {};
    for (const [key, def] of Object.entries(manifest.vars ?? {})) {
      switch (def.from) {
        case "url":
          appVars[key] = urls[appId];
          break;
        case "appUrl": {
          const target = def.app ?? appId;
          appVars[key] = urls[target] ?? "";
          break;
        }
        case "ownerEmail":
          appVars[key] = config.ownerEmail;
          break;
        case "appId":
          appVars[key] = `shedflare-${appId}`;
          break;
        case "user":
          appVars[key] = config.vars[appId]?.[key] ?? def.default ?? "";
          break;
      }
    }
    resolvedVars[appId] = appVars;

    const appSecrets: Record<string, string> = {};
    for (const key of Object.keys(manifest.secrets ?? {})) {
      appSecrets[key] = "";
    }
    resolvedSecrets[appId] = appSecrets;
  }

  return {
    apps: enabledAppIds.map((id) => manifests[id]).filter(Boolean),
    deployOrder,
    urls,
    resourceIds,
    resolvedVars,
    resolvedSecrets,
    mockResources,
  };
}

export function computeDeployOrder(
  selected: AppId[],
  manifests: Record<string, AppManifest>,
): AppId[] {
  const ordered: AppId[] = [];
  const visited = new Set<string>();

  function visit(appId: AppId): void {
    if (visited.has(appId)) return;
    visited.add(appId);
    const manifests_ = manifests[appId];
    if (manifests_) {
      for (const dep of manifests_.dependsOn) {
        if (selected.includes(dep)) {
          visit(dep);
        }
      }
    }
    ordered.push(appId);
  }

  for (const appId of selected) {
    visit(appId);
  }

  return ordered;
}
