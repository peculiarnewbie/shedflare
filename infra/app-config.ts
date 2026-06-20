import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "jsonc-parser";
import { fileURLToPath } from "node:url";

const CONFIG_FILENAME = "config.jsonc";

/**
 * Loads `apps/<appId>/config.jsonc` from the repo root.
 *
 * Returns `null` when the file is absent so the build can fall back to
 * example defaults without throwing. The file is gitignored (paired with
 * a committed `config.example.jsonc`) and holds per-deploy non-secret
 * content that ships baked into the client bundle at build time.
 */
export function loadAppConfig<T = Record<string, unknown>>(
  metaUrl: string,
  appId: string,
): T | null {
  const appDir = path.dirname(fileURLToPath(metaUrl));
  const repoRoot = findRepoRoot(appDir);
  const configPath = path.join(repoRoot, "apps", appId, CONFIG_FILENAME);
  if (!existsSync(configPath)) return null;
  const raw = readFileSync(configPath, "utf8");
  return parse(raw, undefined, { allowTrailingComma: true }) as T;
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not find repo root (no pnpm-workspace.yaml ancestor) starting from ${start}`,
  );
}
