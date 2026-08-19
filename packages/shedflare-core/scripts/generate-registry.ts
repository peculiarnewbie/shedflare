import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonc } from "../src/jsonc.ts";
import { parseManifest } from "../src/manifests/discover.ts";
import { findRepoRoot } from "../src/paths.ts";

const root = findRepoRoot(process.cwd());
const appsDir = join(root, "apps");
const ids = readdirSync(appsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => existsSync(join(appsDir, entry.name, "shedflare.app.jsonc")))
  .map((entry) => {
    const file = join(appsDir, entry.name, "shedflare.app.jsonc");
    const parsed = parseManifest(parseJsonc(readFileSync(file, "utf8"), file), file);
    if (parsed.id !== entry.name) {
      throw new Error(`${file} declares id "${parsed.id}", but its directory is "${entry.name}"`);
    }
    return parsed.id;
  })
  .sort((left, right) => left.localeCompare(right));

const output = `// Generated from apps/*/shedflare.app.jsonc. Do not edit.\n\nexport const APP_IDS = [\n${ids
  .map((id) => `  ${JSON.stringify(id)},`)
  .join(
    "\n",
  )}\n] as const;\n\nexport type AppId = (typeof APP_IDS)[number];\n\nconst APP_ID_SET: ReadonlySet<string> = new Set(APP_IDS);\n\nexport function isAppId(value: string): value is AppId {\n  return APP_ID_SET.has(value);\n}\n`;

const target = join(root, "packages", "shedflare-core", "src", "app-id.ts");
if (process.argv.includes("--check")) {
  if (!existsSync(target) || readFileSync(target, "utf8") !== output) {
    throw new Error("App registry is out of date. Run `pnpm registry:generate`.");
  }
} else {
  writeFileSync(target, output);
}
