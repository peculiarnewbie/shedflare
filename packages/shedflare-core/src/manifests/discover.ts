import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getDotPath, safeParse } from "valibot";
import { CatalogValidationError, CoreError } from "../errors.ts";
import { MANIFEST_FILENAME, manifestPath } from "../paths.ts";
import type { AppManifest, ManifestCatalog, ResourceDescriptor } from "./model.ts";
import { AppManifestSchema } from "./schema.ts";
import { parseJsonc } from "../jsonc.ts";

export interface ManifestCatalogEntry {
  readonly manifest: AppManifest;
  readonly source?: string;
}

export function parseManifest(input: unknown, source = "<manifest>"): AppManifest {
  const result = safeParse(AppManifestSchema, input);
  if (!result.success) {
    const issue = result.issues[0];
    const fieldPath = getDotPath(issue) ?? undefined;
    throw new CoreError(
      "MANIFEST_INVALID",
      `${source}${fieldPath ? `:${fieldPath}` : ""} ${issue.message}`,
      { filePath: source, fieldPath, expectation: issue.expected ?? undefined },
    );
  }

  const manifest = result.output;
  return {
    ...(manifest.$schema === undefined ? {} : { $schema: manifest.$schema }),
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    lifecycle: manifest.lifecycle,
    category: manifest.category,
    dataSensitivity: manifest.dataSensitivity,
    dependsOn: [...(manifest.dependsOn ?? [])],
    defaultSubdomain: manifest.defaultSubdomain,
    vars: { ...manifest.vars },
    secrets: { ...manifest.secrets },
    resources: [...(manifest.resources ?? [])] as readonly ResourceDescriptor[],
  };
}

export function loadManifestFile(filePath: string): AppManifest {
  if (!existsSync(filePath)) {
    throw new CoreError("MANIFEST_NOT_FOUND", `Manifest not found: ${filePath}`, { filePath });
  }
  return parseManifest(parseJsonc(readFileSync(filePath, "utf8"), filePath), filePath);
}

/** @deprecated Use loadManifestFile with an explicit manifest path. */
export function loadManifest(root: string, appId: string): AppManifest {
  return loadManifestFile(manifestPath(root, appId));
}

function dependencyCycle(manifests: ReadonlyMap<string, AppManifest>): string[] | undefined {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];

  function visit(appId: string): string[] | undefined {
    if (visiting.has(appId)) {
      const cycleStart = path.indexOf(appId);
      return [...path.slice(cycleStart), appId];
    }
    if (visited.has(appId)) return undefined;

    visited.add(appId);
    visiting.add(appId);
    path.push(appId);
    for (const dependency of manifests.get(appId)?.dependsOn ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(appId);
    return undefined;
  }

  for (const appId of manifests.keys()) {
    const cycle = visit(appId);
    if (cycle) return cycle;
  }
  return undefined;
}

function buildManifestCatalog(
  entries: Iterable<ManifestCatalogEntry>,
  initialErrors: readonly CoreError[] = [],
): ManifestCatalog {
  const errors = [...initialErrors];
  const manifests = new Map<string, AppManifest>();

  for (const { manifest, source = `<manifest:${manifest.id}>` } of entries) {
    if (manifests.has(manifest.id)) {
      errors.push(
        new CoreError("MANIFEST_INVALID", `Duplicate manifest id "${manifest.id}" in ${source}`, {
          filePath: source,
          fieldPath: "id",
        }),
      );
    } else {
      manifests.set(manifest.id, manifest);
    }
  }

  for (const manifest of manifests.values()) {
    for (const dependency of manifest.dependsOn) {
      if (!manifests.has(dependency)) {
        errors.push(
          new CoreError(
            "MANIFEST_DEPENDENCY_MISSING",
            `Manifest "${manifest.id}" depends on missing app "${dependency}"`,
            { fieldPath: "dependsOn" },
          ),
        );
      }
    }
  }

  const cycle = dependencyCycle(manifests);
  if (cycle) {
    errors.push(
      new CoreError(
        "MANIFEST_DEPENDENCY_CYCLE",
        `Manifest dependency cycle: ${cycle.join(" -> ")}`,
      ),
    );
  }

  if (errors.length > 0) throw new CatalogValidationError(errors);

  const appIds = [...manifests.keys()].sort((left, right) => left.localeCompare(right));
  return { appIds, manifests };
}

export function createManifestCatalog(entries: Iterable<ManifestCatalogEntry>): ManifestCatalog {
  return buildManifestCatalog(entries);
}

export function discoverManifestDirectory(appsDir: string): ManifestCatalog {
  if (!existsSync(appsDir)) {
    throw new CatalogValidationError([
      new CoreError("MANIFEST_NOT_FOUND", `Apps directory not found: ${appsDir}`, {
        filePath: appsDir,
      }),
    ]);
  }

  const errors: CoreError[] = [];
  const manifests: ManifestCatalogEntry[] = [];
  const entries = readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(appsDir, entry.name, MANIFEST_FILENAME)))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const filePath = join(appsDir, entry.name, MANIFEST_FILENAME);
    try {
      const manifest = loadManifestFile(filePath);
      if (manifest.id !== entry.name) {
        errors.push(
          new CoreError(
            "MANIFEST_ID_MISMATCH",
            `Manifest ${filePath} declares id "${manifest.id}", but its directory is "${entry.name}"`,
            { filePath, fieldPath: "id" },
          ),
        );
      }
      manifests.push({ manifest, source: filePath });
    } catch (error) {
      errors.push(
        error instanceof CoreError
          ? error
          : new CoreError("MANIFEST_INVALID", String(error), {
              filePath,
            }),
      );
    }
  }

  return buildManifestCatalog(manifests, errors);
}

/** @deprecated Use discoverManifestDirectory with an explicit apps directory. */
export function discoverManifests(root: string): ManifestCatalog {
  return discoverManifestDirectory(join(root, "apps"));
}
