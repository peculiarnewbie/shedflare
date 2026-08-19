import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "jsonc-parser";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";

const CONFIG_FILENAME = "config.jsonc";

export type AppConfigValue =
  | string
  | number
  | boolean
  | null
  | readonly AppConfigValue[]
  | AppConfig;
export type AppConfig = { readonly [key: string]: AppConfigValue | undefined };

/**
 * Loads `apps/<appId>/config.jsonc` from the repo root.
 *
 * Returns `null` when the file is absent so the build can fall back to
 * example defaults without throwing. The file is gitignored (paired with
 * a committed `config.example.jsonc`) and holds per-deploy non-secret
 * content that ships baked into the client bundle at build time.
 */
export function loadAppConfig(metaUrl: string, appId: string): AppConfig | null {
  const appDir = path.dirname(fileURLToPath(metaUrl));
  const repoRoot = findRepoRoot(appDir);
  const configPath = path.join(repoRoot, "apps", appId, CONFIG_FILENAME);
  if (!existsSync(configPath)) return null;
  const raw = readFileSync(configPath, "utf8");
  const decoded = parse(raw, undefined, { allowTrailingComma: true });
  if (!Schema.is(Schema.Record(Schema.String, Schema.Any))(decoded)) {
    throw new Error(`${configPath} must contain a JSON object`);
  }
  // SAFETY: jsonc-parser produces only JSON values, and the root container was verified above.
  return decoded as AppConfig;
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
