import type { AppManifest, AppId, ResourceDef } from "./manifests.js";
import type { ShedflareConfig, AppEntry } from "./config.js";

export interface MergedWranglerConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function getSubdomain(
  appId: AppId,
  manifests: Record<AppId, AppManifest>,
  config: ShedflareConfig,
): string {
  const appConfig = config.apps[appId] as AppEntry | undefined;
  if (appConfig?.subdomain) return appConfig.subdomain;
  return manifests[appId].defaultSubdomain;
}

function getAppUrl(
  appId: AppId,
  config: ShedflareConfig,
  manifests: Record<AppId, AppManifest>,
): string {
  const subdomain = getSubdomain(appId, manifests, config);
  return `https://${subdomain}.${config.domain}`;
}

export function resolveVars(
  appId: AppId,
  manifes: AppManifest,
  config: ShedflareConfig,
  manifests: Record<AppId, AppManifest>,
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [key, def] of Object.entries(manifes.vars)) {
    switch (def.from) {
      case "url": {
        resolved[key] = getAppUrl(appId, config, manifests);
        break;
      }
      case "appUrl": {
        const target = def.app ?? appId;
        resolved[key] = getAppUrl(target, config, manifests);
        break;
      }
      case "ownerEmail": {
        resolved[key] = config.ownerEmail;
        break;
      }
      case "appId": {
        resolved[key] = `shedflare-${appId}`;
        break;
      }
      case "user": {
        const userValue = config.vars?.[appId]?.[key];
        resolved[key] = userValue ?? def.default ?? "";
        break;
      }
    }
  }

  return resolved;
}

export function resolveSecrets(manifes: AppManifest): string[] {
  return Object.entries(manifes.secrets)
    .filter(([_, def]) => def.required)
    .map(([key]) => key);
}

export function mergeResourceConfig(
  base: Record<string, unknown>,
  appId: AppId,
  manifes: AppManifest,
  config: ShedflareConfig,
  resourceIds: Record<AppId, Record<string, string>>,
): Record<string, unknown> {
  const result = { ...base } as Record<string, unknown>;

  for (const resource of manifes.resources) {
    applyResource(result, resource, appId, config, resourceIds);
  }

  return result;
}

function applyResource(
  config: Record<string, unknown>,
  resource: ResourceDef,
  appId: AppId,
  _config: ShedflareConfig,
  resourceIds: Record<AppId, Record<string, string>>,
): void {
  switch (resource.type) {
    case "kv": {
      const entries = (config.kv_namespaces as Array<Record<string, unknown>>) ?? [];
      const entry = entries.find((e) => e.binding === resource.binding);
      if (entry) {
        const id = resourceIds[appId]?.[resource.idField];
        if (id) entry.id = id;
        entry.id ??= "";
      }
      break;
    }
    case "d1": {
      const entries = (config.d1_databases as Array<Record<string, unknown>>) ?? [];
      let entry = entries.find((e) => e.binding === resource.binding);
      if (!entry) {
        entry = { binding: resource.binding };
        entries.push(entry);
      }
      const id = resourceIds[appId]?.[resource.idField];
      entry.database_name = resource.name;
      entry.database_id = id ?? "";
      break;
    }
    case "r2": {
      const entries = (config.r2_buckets as Array<Record<string, unknown>>) ?? [];
      let entry = entries.find((e) => e.binding === resource.binding);
      if (!entry) {
        entry = { binding: resource.binding };
        entries.push(entry);
      }
      entry.bucket_name = resource.name;
      break;
    }
    case "durable_object": {
      break;
    }
    case "browser": {
      break;
    }
  }
}

export function addRoutes(
  config: Record<string, unknown>,
  appId: AppId,
  config_: ShedflareConfig,
  manifests: Record<AppId, AppManifest>,
): void {
  const subdomain = getSubdomain(appId, manifests, config_);
  config.routes = [
    {
      pattern: `${subdomain}.${config_.domain}`,
      custom_domain: true,
    },
  ];
}

export function addSecretsBlock(config: Record<string, unknown>, requiredSecrets: string[]): void {
  if (requiredSecrets.length > 0) {
    config.secrets = { required: requiredSecrets };
  }
}

export function mergeWranglerConfig(
  base: Record<string, unknown>,
  appId: AppId,
  manifes: AppManifest,
  config: ShedflareConfig,
  manifests: Record<AppId, AppManifest>,
  resourceIds: Record<AppId, Record<string, string>>,
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;

  // Resolve and set vars
  const resolvedVars = resolveVars(appId, manifes, config, manifests);
  result.vars = resolvedVars;

  // Add secrets block
  const requiredSecrets = resolveSecrets(manifes);
  addSecretsBlock(result, requiredSecrets);

  // Merge resource configs
  mergeResourceConfig(result, appId, manifes, config, resourceIds);

  // Add routes
  addRoutes(result, appId, config, manifests);

  return result;
}
