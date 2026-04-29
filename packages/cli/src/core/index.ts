export {
  APP_IDS,
  type AppId,
  type AppManifest,
  type VarDef,
  type SecretDef,
  type ResourceDef,
  loadManifest,
  getAllManifests,
  isAppId,
  getWorkspaceRoot,
} from "./manifests.js";

export { BUILTIN_MANIFESTS } from "./manifests-data.js";

export {
  type ShedflareConfig,
  type AppEntry,
  loadConfig,
  validateConfig,
  writeConfig,
  configPath,
  exampleConfigPath,
} from "./config.js";

export {
  type MergedWranglerConfig,
  mergeWranglerConfig,
  resolveVars,
  resolveSecrets,
  mergeResourceConfig,
  addRoutes,
  addSecretsBlock,
} from "./template.js";

export {
  type InitOptions,
  type InitDraft,
  type InitPlan,
  createDraft,
  validateDraft,
  createPlan,
} from "./init-draft.js";

export { writeAppFiles, writeWorkspaceFiles } from "./generate.js";

export { type ProvisionResult, provisionResources } from "./provision.js";

export { type CheckResult, type DriftReport, runDoctor, checkDrift } from "./validate.js";

export {
  type WranglerUser,
  whoami,
  login,
  createKv,
  createD1,
  createR2,
  putSecret,
  deploy,
} from "./wrangler.js";
