import {
  configPath as coreConfigPath,
  discoverManifests,
  findRepoRoot,
  inspectConfig,
  isAppSelected,
  validateConfig as validateCoreConfig,
  writeConfig as writeCoreConfig,
  type ShedflareConfig,
  type ShedflareConfigV2,
} from "@shedflare/core";

export type { ShedflareConfig, ShedflareConfigV2 };

function workspaceRoot(): string {
  return findRepoRoot(process.cwd());
}

function catalog() {
  const root = workspaceRoot();
  return { root, catalog: discoverManifests(root) };
}

export function configPath(): string {
  return coreConfigPath(workspaceRoot());
}

export function exampleConfigPath(): string {
  return `${workspaceRoot()}/shedflare.config.example.jsonc`;
}

export function loadConfig(): ShedflareConfig | null {
  const { root, catalog: manifests } = catalog();
  return inspectConfig(root, manifests).config ?? null;
}

export function validateConfig<Config>(
  config: Config,
): { success: true; value: ShedflareConfig } | { success: false; error: string } {
  try {
    const { catalog: manifests } = catalog();
    return { success: true, value: validateCoreConfig(config, manifests) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function writeConfig(config: ShedflareConfigV2): void {
  const { root, catalog: manifests } = catalog();
  writeCoreConfig(root, config, manifests);
}

export { isAppSelected };
