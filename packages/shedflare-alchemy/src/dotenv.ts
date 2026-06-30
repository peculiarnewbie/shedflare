import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function parseDotEnv(source: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

export function loadDotEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;

  const values = parseDotEnv(readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    process.env[key] ??= value;
  }
}

export function loadRepoDotEnv(root = process.cwd()): void {
  loadDotEnvFile(join(root, ".env"));
}
