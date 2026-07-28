import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const CONFIG_FILENAME = "shedflare.config.jsonc";
export const MANIFEST_FILENAME = "shedflare.app.jsonc";

export function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml")) && existsSync(join(current, "apps"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Could not find Shedflare repository root from ${start}`);
    }
    current = parent;
  }
}

export function configPath(root: string): string {
  return join(root, CONFIG_FILENAME);
}

export function manifestPath(root: string, appId: string): string {
  return join(root, "apps", appId, MANIFEST_FILENAME);
}
