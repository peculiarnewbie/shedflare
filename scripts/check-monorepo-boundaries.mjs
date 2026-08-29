import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { object, optional, parse, record, string } from "valibot";

const RepositorySchema = object({
  type: string(),
  url: string(),
  directory: string(),
});

const PackageManifestSchema = object({
  name: string(),
  repository: optional(RepositorySchema),
  packageManager: optional(string()),
  scripts: optional(record(string(), string())),
  dependencies: optional(record(string(), string())),
  devDependencies: optional(record(string(), string())),
  optionalDependencies: optional(record(string(), string())),
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryUrl = "git+https://github.com/shedflare/shedflare.git";
const forbiddenProjectEntries = [
  ".git",
  ".github",
  ".oxlintrc.json",
  "anti-slop.vite.ts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "shedflare.config.example.jsonc",
  "tools/oxlint/anti-slop",
];

function projectDirectories(parent) {
  return readdirSync(join(root, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${parent}/${entry.name}`)
    .filter((directory) => existsSync(join(root, directory, "package.json")));
}

function readManifest(directory) {
  const file = join(root, directory, "package.json");
  return parse(PackageManifestSchema, JSON.parse(readFileSync(file, "utf8")));
}

const appDirectories = projectDirectories("apps");
const workspaceDirectories = [...appDirectories, ...projectDirectories("packages"), "site"];
const manifests = new Map(
  workspaceDirectories.map((directory) => [directory, readManifest(directory)]),
);
const workspacePackageNames = new Set([...manifests.values()].map((manifest) => manifest.name));
const errors = [];

for (const directory of workspaceDirectories) {
  const manifest = manifests.get(directory);
  if (!manifest) {
    errors.push(`${directory} is missing a package manifest.`);
    continue;
  }

  if (
    manifest.repository?.type !== "git" ||
    manifest.repository.url !== repositoryUrl ||
    manifest.repository.directory !== directory
  ) {
    errors.push(`${directory}/package.json must point at ${repositoryUrl}#${directory}.`);
  }

  if (manifest.packageManager !== undefined) {
    errors.push(`${directory}/package.json must inherit the root packageManager.`);
  }

  for (const entry of forbiddenProjectEntries) {
    if (existsSync(join(root, directory, entry))) {
      errors.push(`${directory}/${entry} duplicates repository-owned tooling or metadata.`);
    }
  }
}

for (const directory of appDirectories) {
  const manifest = manifests.get(directory);
  if (!manifest) continue;
  const appId = manifest.name.replace(/^@shedflare\//, "");
  const stackPath = join(root, directory, "alchemy.run.ts");
  const stack = readFileSync(stackPath, "utf8");
  const expectedMain = `main: "apps/${appId}/src/worker.ts"`;

  if (!stack.includes(`Shedflare.appConfig("${appId}")`)) {
    errors.push(`${directory}/alchemy.run.ts must resolve app config from the root catalog.`);
  }
  if (!stack.includes(expectedMain)) {
    errors.push(
      `${directory}/alchemy.run.ts must use root-relative Worker entrypoint ${expectedMain}.`,
    );
  }
  if (stack.includes("./deploy/config.ts")) {
    errors.push(`${directory}/alchemy.run.ts must not use checkout-relative deployment config.`);
  }
  if (!manifest.scripts?.plan?.includes(`${directory}/alchemy.run.ts`)) {
    errors.push(`${directory}/package.json plan must invoke its stack from the repository root.`);
  }
}

const siteStack = readFileSync(join(root, "site/alchemy.run.ts"), "utf8");
for (const expectedPath of ['main: "site/src/worker.ts"', 'assets: "site/dist"']) {
  if (!siteStack.includes(expectedPath)) {
    errors.push(`site/alchemy.run.ts must contain root-relative path ${expectedPath}.`);
  }
}

for (const [directory, manifest] of manifests) {
  for (const dependencies of [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
  ]) {
    for (const [name, version] of Object.entries(dependencies ?? {})) {
      if (/^(file|link):/.test(version)) {
        errors.push(`${directory} uses forbidden filesystem dependency ${name}@${version}.`);
      }
      if (workspacePackageNames.has(name) && !version.startsWith("workspace:")) {
        errors.push(`${directory} must use the workspace protocol for ${name}.`);
      }
    }
  }
}

if (errors.length > 0) {
  throw new Error(`Monorepo boundary violations:\n- ${errors.join("\n- ")}`);
}

console.log(
  `Monorepo boundaries valid: ${appDirectories.length} apps, ${workspaceDirectories.length} projects.`,
);
