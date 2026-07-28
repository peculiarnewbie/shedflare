import {
  discoverManifests,
  findRepoRoot,
  loadConfig,
  resolveAppConfig,
  stageSubdomain,
  validateConfig,
  type AppId,
  type ResolvedAppConfig,
  type ShedflareConfig,
  type ShedflareConfigV1,
} from "@shedflare/core";

export type { AppId } from "@shedflare/core";

type LegacyConfigInput = Omit<ShedflareConfigV1, "configVersion" | "vars" | "resources"> & {
  readonly vars?: ShedflareConfigV1["vars"];
  readonly resources?: ShedflareConfigV1["resources"];
};

/**
 * Accepts normalized core config and the legacy in-memory test shape. File reads
 * always return the core model; the legacy input remains only for stack helper
 * compatibility while callers migrate.
 */
export type ShedflareAlchemyConfig = ShedflareConfig | LegacyConfigInput;

export interface AppStackConfig extends ResolvedAppConfig {
  /** @deprecated Use stageSubdomain; kept for existing Alchemy stacks. */
  readonly subdomain: string;
}

function normalizeConfig(config: ShedflareAlchemyConfig, root: string): ShedflareConfig {
  if ("configVersion" in config) return config;
  return validateConfig(config, discoverManifests(findRepoRoot(root)));
}

export function loadShedflareConfig(root = process.cwd()): ShedflareConfig {
  const repositoryRoot = findRepoRoot(root);
  return loadConfig(repositoryRoot, discoverManifests(repositoryRoot));
}

export function appStackConfig(
  config: ShedflareAlchemyConfig,
  appId: AppId,
  stage = "prod",
  root = process.cwd(),
): AppStackConfig {
  const resolved = resolveAppConfig(
    normalizeConfig(config, root),
    discoverManifests(findRepoRoot(root)),
    appId,
    stage,
  );
  return { ...resolved, subdomain: resolved.stageSubdomain };
}

export { stageSubdomain };

export function requireVar(config: AppStackConfig, name: string): string {
  const fromConfig = config.vars[name];
  if (fromConfig) return fromConfig;

  const envName = `SHEDFLARE_${config.appId.toUpperCase().replaceAll("-", "_")}_${name}`;
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;

  throw new Error(
    `Missing ${config.appId} var ${name}. Set apps.${config.appId}.vars.${name} in shedflare.config.jsonc or ${envName}.`,
  );
}

export function optionalVar(config: AppStackConfig, name: string, fallback = ""): string {
  return (
    config.vars[name] ??
    process.env[`SHEDFLARE_${config.appId.toUpperCase().replaceAll("-", "_")}_${name}`] ??
    fallback
  );
}
