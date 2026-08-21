import { existsSync, readFileSync } from "node:fs";
import { parse, type ParseError } from "jsonc-parser";
import { object, optional, record, safeParse, string } from "valibot";
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

const rootStackPath = `${root}/alchemy.run.ts`;
const rootStack = readFileSync(rootStackPath, "utf8");
const packageJson = safeParse(
  object({ scripts: optional(record(string(), string())) }),
  JSON.parse(readFileSync(`${root}/package.json`, "utf8")),
);
if (!packageJson.success) throw new Error(`${root}/package.json has invalid scripts.`);
const scripts = packageJson.output.scripts ?? {};
const externallyOwnedAppIds = new Set(["drive"]);

for (const appId of catalog.appIds) {
  const stackPath = `${root}/apps/${appId}/alchemy.run.ts`;
  if (!existsSync(stackPath)) throw new Error(`${stackPath} is missing.`);
  if (externallyOwnedAppIds.has(appId)) {
    if (rootStack.includes(`./apps/${appId}/alchemy.run.ts`)) {
      throw new Error(`${rootStackPath} must not compose externally owned app "${appId}".`);
    }
    if (scripts[`deploy:${appId}`] || scripts[`destroy:${appId}`]) {
      throw new Error(`package.json must not deploy or destroy externally owned app "${appId}".`);
    }
    if (config.apps[appId]) {
      throw new Error(`${examplePath} must not select externally owned app "${appId}".`);
    }
    continue;
  }
  if (!rootStack.includes(`./apps/${appId}/alchemy.run.ts`)) {
    throw new Error(`${rootStackPath} does not compose the selected app "${appId}".`);
  }
  if (!scripts[`deploy:${appId}`] || !scripts[`destroy:${appId}`]) {
    throw new Error(`package.json must define deploy:${appId} and destroy:${appId}.`);
  }
  if (!config.apps[appId]) {
    throw new Error(
      `${examplePath} must select catalog app "${appId}" for the full-suite example.`,
    );
  }
}
