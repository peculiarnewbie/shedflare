import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./repo-root.ts";

export function parseDotEnv(source: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replaceAll(/\\([nrt"\\])/g, (_full, escaped: string) => {
        if (escaped === "n") return "\n";
        if (escaped === "r") return "\r";
        if (escaped === "t") return "\t";
        return escaped;
      });
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      const commentStart = value.search(/\s#/);
      if (commentStart >= 0) value = value.slice(0, commentStart).trimEnd();
    }

    values[key] = value;
  }

  return values;
}

export function loadDotEnvFile(file: string): void {
  if (!existsSync(file)) return;

  for (const [key, value] of Object.entries(parseDotEnv(readFileSync(file, "utf8")))) {
    process.env[key] ??= value;
  }
}

export function loadRepoDotEnv(): void {
  loadDotEnvFile(path.join(REPO_ROOT, ".env"));
}
