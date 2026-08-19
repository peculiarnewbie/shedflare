import { CoreError } from "../errors.ts";
import type { ManifestCatalog } from "../manifests/model.ts";
import type { ResolvedAppConfig, ShedflareConfig } from "./model.ts";

export function isAppSelected(config: ShedflareConfig, appId: string): boolean {
  if (config.configVersion === 1) {
    const selection = config.apps[appId];
    return selection !== undefined && selection.enabled !== false;
  }
  return config.apps[appId] !== undefined;
}

export function selectedAppIds(config: ShedflareConfig): string[] {
  return Object.keys(config.apps).filter((appId) => isAppSelected(config, appId));
}

function safeStageSuffix(stage: string): string {
  return stage
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "-")
    .replaceAll(/-+/g, "-");
}

export function stageSubdomain(subdomain: string, stage: string): string {
  if (stage === "prod") return subdomain;
  const suffix = safeStageSuffix(stage);
  return suffix ? `${subdomain}-${suffix}` : subdomain;
}

export function resolveAppConfig(
  config: ShedflareConfig,
  catalog: ManifestCatalog,
  appId: string,
  stage = "prod",
): ResolvedAppConfig {
  const manifest = catalog.manifests.get(appId);
  if (!manifest) {
    throw new CoreError("CONFIG_UNKNOWN_APP", `Unknown app "${appId}" in the manifest catalog.`);
  }

  const legacySelection = config.configVersion === 1 ? config.apps[appId] : undefined;
  const selection = config.configVersion === 2 ? config.apps[appId] : undefined;
  if (!isAppSelected(config, appId)) {
    throw new CoreError("CONFIG_UNKNOWN_APP", `App "${appId}" is not selected in config.`);
  }

  const configuredSubdomain =
    legacySelection?.subdomain ?? selection?.subdomain ?? manifest.defaultSubdomain;
  const resolvedVars: Record<string, string> = {};
  for (const [name, definition] of Object.entries(manifest.vars)) {
    if (definition.from === "user" && definition.default !== undefined) {
      resolvedVars[name] = definition.default;
    }
  }
  Object.assign(
    resolvedVars,
    config.configVersion === 1 ? (config.vars[appId] ?? {}) : (selection?.vars ?? {}),
  );

  const stageSpecificSubdomain = stageSubdomain(configuredSubdomain, stage);
  return {
    appId,
    domain: config.domain,
    configuredSubdomain,
    stageSubdomain: stageSpecificSubdomain,
    url: `https://${stageSpecificSubdomain}.${config.domain}`,
    ownerEmail: config.ownerEmail,
    vars: resolvedVars,
  };
}
