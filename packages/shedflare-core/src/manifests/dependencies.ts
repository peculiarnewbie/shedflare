import { CoreError } from "../errors.ts";
import type { ManifestCatalog } from "./model.ts";

export function resolveAppDependencies(
  selected: readonly string[],
  catalog: ManifestCatalog,
): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();

  function visit(appId: string): void {
    if (seen.has(appId)) return;
    const manifest = catalog.manifests.get(appId);
    if (!manifest) {
      throw new CoreError("MANIFEST_NOT_FOUND", `App "${appId}" is not in the manifest catalog.`);
    }
    seen.add(appId);
    for (const dependency of manifest.dependsOn) visit(dependency);
    resolved.push(appId);
  }

  for (const appId of selected) visit(appId);
  return resolved;
}

export function computeDeployOrder(
  selected: readonly string[],
  catalog: ManifestCatalog,
): string[] {
  return resolveAppDependencies(selected, catalog);
}
