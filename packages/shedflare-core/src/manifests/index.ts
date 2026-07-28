export { computeDeployOrder, resolveAppDependencies } from "./dependencies.ts";
export { discoverManifests, loadManifest } from "./discover.ts";
export type {
  AppCategory,
  AppManifest,
  BrowserResourceDescriptor,
  D1ResourceDescriptor,
  DataSensitivity,
  DurableObjectResourceDescriptor,
  KvResourceDescriptor,
  Lifecycle,
  ManifestCatalog,
  R2ResourceDescriptor,
  ResourceDescriptor,
  SecretDefinition,
  VarDefinition,
  VarSource,
} from "./model.ts";
export {
  AppManifestSchema,
  ResourceDescriptorSchema,
  SecretDefinitionSchema,
  VarDefinitionSchema,
} from "./schema.ts";
