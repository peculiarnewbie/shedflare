import type { InitOptions } from "../core/init-draft.js";
import { createDraft, validateDraft, createPlan } from "../core/init-draft.js";
import { APP_IDS, loadManifest } from "../core/manifests.js";
import type { AppId } from "../core/manifests.js";
import { writeConfig } from "../core/config.js";
import type { ShedflareConfig } from "../core/config.js";
import { whoami, login } from "../core/wrangler.js";
import {
  selectApps,
  askEmail,
  askDomain,
  askSubdomain,
  askVar,
  askSecret,
  askConfirm,
} from "../headless/prompts.js";

export async function initCommand(options: InitOptions): Promise<void> {
  const interactive = !options.yes;

  let selectedApps: AppId[];
  let ownerEmail: string;
  let domain: string;
  const subdomains: Record<string, string> = {};
  const vars: Record<string, Record<string, string>> = {};
  const secrets: Record<string, Record<string, string>> = {};

  if (interactive) {
    // Check wrangler login
    const user = await whoami();
    if (!user) {
      console.log("You need to be logged in to Cloudflare via Wrangler.");
      const shouldLogin = await askConfirm("Open browser to log in with Wrangler?");
      if (shouldLogin) {
        await login();
      }
    }

    selectedApps = await selectApps();
    ownerEmail = await askEmail();
    domain = await askDomain();

    for (const appId of selectedApps) {
      const manifes = loadManifest(appId);
      const subdomain = await askSubdomain(appId, manifes.defaultSubdomain);
      subdomains[appId] = subdomain;

      // Prompt for user-configurable vars
      const appVars: Record<string, string> = {};
      for (const [key, def] of Object.entries(manifes.vars)) {
        if (def.from === "user") {
          const value = await askVar(key, def.description, def.default);
          appVars[key] = value;
        }
      }
      if (Object.keys(appVars).length > 0) {
        vars[appId] = appVars;
      }

      // Prompt for secrets
      const appSecrets: Record<string, string> = {};
      for (const [key, def] of Object.entries(manifes.secrets)) {
        const value = await askSecret(key, def.description);
        appSecrets[key] = value;
      }
      if (Object.keys(appSecrets).length > 0) {
        secrets[appId] = appSecrets;
      }
    }
  } else {
    selectedApps = options.apps
      ? (options.apps.split(",").map((s) => s.trim()) as AppId[])
      : [...APP_IDS];
    ownerEmail = options.ownerEmail ?? "";
    domain = options.domain ?? "";
  }

  const draft = createDraft({
    ...options,
    apps: selectedApps.join(","),
    ownerEmail,
    domain,
  });
  draft.subdomains = subdomains;
  draft.vars = vars;
  draft.secrets = secrets;

  const validation = validateDraft(draft);
  if (!validation.valid) {
    console.error("Validation errors:");
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  // Build manifests lookup
  const manifests: Record<string, import("../core/manifests.js").AppManifest> = {};
  for (const id of APP_IDS) {
    try {
      manifests[id] = loadManifest(id);
    } catch {
      console.warn(`[init] Failed to load manifest for ${id}`);
    }
  }

  // Create plan
  const plan = createPlan(draft, manifests);
  console.log("Plan created:");
  console.log(`  Apps: ${plan.apps.map((a) => a.id).join(", ")}`);
  console.log(`  Deploy order: ${plan.deployOrder.join(" → ")}`);

  // Build config
  const config: ShedflareConfig = {
    domain,
    ownerEmail,
    apps: {},
    vars: {},
    resources: {},
  };

  for (const app of plan.apps) {
    config.apps[app.id] = {
      enabled: true,
      subdomain: draft.subdomains[app.id] ?? app.defaultSubdomain,
    };
    if (draft.vars[app.id]) {
      config.vars[app.id] = draft.vars[app.id];
    }
  }

  // Write config
  writeConfig(config);
  console.log("\nConfig written to shedflare.config.jsonc");

  // Print summary
  console.log("\n── Setup Complete ──");
  console.log(`  Domain: ${domain}`);
  console.log(`  Owner: ${ownerEmail}`);
  console.log("  URLs:");
  for (const app of plan.apps) {
    const subdomain = draft.subdomains[app.id] ?? app.defaultSubdomain;
    console.log(`    ${app.id}: https://${subdomain}.${domain}`);
  }
  console.log("\nNext steps:");
  console.log("  1. Deploy with Alchemy: pnpm deploy");
  console.log("  2. Set required secrets: shedflare secret set <app> <NAME>");
  console.log("  3. Or use pnpm deploy:<app> to deploy individual apps");
}
