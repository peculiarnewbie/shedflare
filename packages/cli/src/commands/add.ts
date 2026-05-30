import { loadConfig, validateConfig, writeConfig } from "../core/config.js";
import { APP_IDS, loadManifest, isAppId } from "../core/manifests.js";
import type { AppManifest } from "../core/manifests.js";
import { createDraft, validateDraft, createPlan } from "../core/init-draft.js";
import { provisionResources } from "../core/provision.js";
import { writeBaseConfig, writeAppFiles } from "../core/generate.js";
import { askSubdomain, askVar, askSecret } from "../headless/prompts.js";

export interface AddOptions {
  app: string;
  subdomain?: string;
  yes?: boolean;
  mockResources?: boolean;
}

export async function addCommand(options: AddOptions): Promise<void> {
  const appId = options.app;

  if (!isAppId(appId)) {
    console.error(`Unknown app: ${appId}. Valid apps: ${APP_IDS.join(", ")}`);
    process.exit(1);
  }

  const config = loadConfig();
  if (!config) {
    console.error("shedflare.config.jsonc not found. Run `shedflare init` first.");
    process.exit(1);
  }

  const validation = validateConfig(config);
  if (!validation.success) {
    console.error("Invalid shedflare.config.jsonc:", validation.error);
    process.exit(1);
  }

  const validConfig = validation.value;

  // Check if app is already enabled
  if (validConfig.apps[appId]?.enabled) {
    console.error(`App "${appId}" is already enabled.`);
    process.exit(1);
  }

  // Load manifest
  const manifest = loadManifest(appId);

  // Check that all dependencies are enabled
  for (const dep of manifest.dependsOn) {
    if (!validConfig.apps[dep]?.enabled) {
      console.error(
        `App "${appId}" depends on "${dep}", which is not enabled. Run \`shedflare add ${dep}\` first.`,
      );
      process.exit(1);
    }
  }

  // Prompt for app-specific settings
  const interactive = !options.yes;
  let subdomain = options.subdomain ?? manifest.defaultSubdomain;
  const vars: Record<string, string> = {};
  const secrets: Record<string, string> = {};

  if (interactive) {
    subdomain = await askSubdomain(appId, manifest.defaultSubdomain);

    for (const [key, def] of Object.entries(manifest.vars)) {
      if (def.from === "user") {
        vars[key] = await askVar(key, def.description, def.default);
      }
    }

    for (const [key, def] of Object.entries(manifest.secrets)) {
      secrets[key] = await askSecret(key, def.description);
    }
  }

  // Build draft with new app + dependencies
  const draftApps = [appId, ...manifest.dependsOn];
  const draft = createDraft({
    apps: draftApps.join(","),
    ownerEmail: validConfig.ownerEmail,
    domain: validConfig.domain,
    mockResources: options.mockResources,
  });

  draft.subdomains[appId] = subdomain;
  // Use existing subdomains for dependency apps
  for (const dep of manifest.dependsOn) {
    draft.subdomains[dep] = validConfig.apps[dep].subdomain;
  }

  if (Object.keys(vars).length > 0) {
    draft.vars[appId] = vars;
  }
  // Use existing vars for dependency apps
  for (const dep of manifest.dependsOn) {
    if (validConfig.vars[dep]) {
      draft.vars[dep] = validConfig.vars[dep];
    }
  }

  if (Object.keys(secrets).length > 0) {
    draft.secrets[appId] = secrets;
  }

  const draftValidation = validateDraft(draft);
  if (!draftValidation.valid) {
    console.error("Validation errors:");
    for (const err of draftValidation.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  // Build manifests lookup
  const manifests: Record<string, AppManifest> = {};
  for (const id of APP_IDS) {
    try {
      manifests[id] = loadManifest(id);
    } catch {
      console.warn(`[add] Failed to load manifest for ${id}`);
    }
  }

  // Create plan
  const plan = createPlan(draft, manifests);

  // Merge existing resource IDs so provisionResources skips them
  for (const [existingAppId, ids] of Object.entries(validConfig.resources)) {
    if (!plan.resourceIds[existingAppId]) {
      plan.resourceIds[existingAppId] = {};
    }
    Object.assign(plan.resourceIds[existingAppId], ids);
  }

  // Provision resources (only new ones will be created)
  console.log(`Adding "${appId}" to workspace...`);
  const provisionResult = await provisionResources(plan);
  plan.resourceIds = provisionResult.resourceIds;

  for (const warning of provisionResult.warnings) {
    console.warn(`  ⚠ ${warning}`);
  }

  // Merge new app into config
  validConfig.apps[appId] = {
    enabled: true,
    subdomain,
  };

  if (Object.keys(vars).length > 0) {
    validConfig.vars[appId] = vars;
  }

  validConfig.resources[appId] = provisionResult.resourceIds[appId] ?? {};

  writeConfig(validConfig);

  // Write files for the new app
  writeBaseConfig(appId);
  writeAppFiles(appId, manifest, validConfig, manifests, validConfig.resources);
  console.log(`  ✓ ${appId} files generated`);

  // Regenerate wrangler.jsonc for dependency apps (their URLs may have changed)
  // This is a no-op in practice since deps come before the new app, but
  // ensures cross-app references are current
  for (const dep of manifest.dependsOn) {
    const depManifest = manifests[dep];
    if (depManifest) {
      writeAppFiles(dep, depManifest, validConfig, manifests, validConfig.resources);
    }
  }

  // Print summary
  console.log(`\n── App Added ──`);
  console.log(`  App: ${appId}`);
  console.log(`  URL: https://${subdomain}.${validConfig.domain}`);
  console.log("\nNext steps:");
  console.log(`  1. Set required secrets via \`wrangler secret put\` (in apps/${appId})`);
  console.log(`  2. Run \`shedflare deploy\` to deploy`);
}
