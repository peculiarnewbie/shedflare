import { readFileSync } from "node:fs";
import { parse, type ParseError } from "jsonc-parser";
import { discoverManifests } from "../src/manifests/discover.ts";
import { validateConfig } from "../src/config/load.ts";
import { findRepoRoot } from "../src/paths.ts";

const root = findRepoRoot(process.cwd());
const catalog = discoverManifests(root);
const examplePath = `${root}/shedflare.config.example.jsonc`;
const parseErrors: ParseError[] = [];
const example = parse(readFileSync(examplePath, "utf8"), parseErrors, {
  allowTrailingComma: true,
  disallowComments: false,
});

if (parseErrors.length > 0) {
  throw new Error(`${examplePath} contains invalid JSONC.`);
}

const config = validateConfig(example, catalog);
if (config.configVersion !== 2) {
  throw new Error(`${examplePath} must use configVersion 2.`);
}
