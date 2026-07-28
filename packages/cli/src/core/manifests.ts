import {
  APP_IDS,
  findRepoRoot,
  isAppId,
  loadManifest as loadCoreManifest,
  type AppId,
  type AppManifest,
  type ResourceDescriptor,
  type SecretDefinition,
  type VarDefinition,
} from "@shedflare/core";

export { APP_IDS, isAppId, type AppId, type AppManifest };
export type VarDef = VarDefinition;
export type SecretDef = SecretDefinition;
export type ResourceDef = ResourceDescriptor;

export function getWorkspaceRoot(): string {
  return findRepoRoot(process.cwd());
}

export function loadManifest(appId: AppId): AppManifest & { readonly id: AppId } {
  const manifest = loadCoreManifest(getWorkspaceRoot(), appId);
  if (manifest.id !== appId) {
    throw new Error(
      `Manifest for "${appId}" declares id "${manifest.id}". Run shedflare doctor to diagnose the catalog.`,
    );
  }
  return { ...manifest, id: appId };
}

export function getAllManifests(): Array<AppManifest & { readonly id: AppId }> {
  return APP_IDS.map((appId) => loadManifest(appId));
}

export function hasD1Resource(manifest: AppManifest): boolean {
  return manifest.resources.some((resource) => resource.type === "d1");
}

export function getD1DatabaseName(manifest: AppManifest): string | undefined {
  return manifest.resources.find((resource) => resource.type === "d1")?.name;
}
