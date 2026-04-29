import type { InitPlan } from "./init-draft.js";
import type { ResourceDef, AppManifest } from "./manifests.js";
import * as wrangler from "./wrangler.js";

export interface ProvisionResult {
  resourceIds: Record<string, Record<string, string>>;
  warnings: string[];
}

function generateMockId(type: string): string {
  const prefix = type === "d1" ? "dcea2933-735e-4970-a4c5-" : "";
  return prefix + "000000000000".slice(0, type === "d1" ? 12 : 32);
}

export async function provisionResources(plan: InitPlan): Promise<ProvisionResult> {
  const resourceIds: Record<string, Record<string, string>> = {};
  const warnings: string[] = [];

  for (const app of plan.apps) {
    const appIds: Record<string, string> = {};
    for (const resource of app.resources) {
      const result = await provisionSingleResource(resource, app, plan);
      if (result.warning) {
        warnings.push(result.warning);
      }
      if (result.id && "idField" in resource) {
        appIds[(resource as ResourceDef & { idField: string }).idField] = result.id;
      }
    }
    resourceIds[app.id] = appIds;
  }

  return { resourceIds, warnings };
}

async function provisionSingleResource(
  resource: ResourceDef,
  app: AppManifest,
  plan: InitPlan,
): Promise<{ id?: string; warning?: string }> {
  if (plan.mockResources) {
    if (resource.type === "kv") {
      return { id: generateMockId("kv") };
    }
    if (resource.type === "d1") {
      return { id: generateMockId("d1") };
    }
    return {};
  }

  try {
    switch (resource.type) {
      case "kv": {
        const result = await wrangler.createKv(resource.name);
        return { id: result.id };
      }
      case "d1": {
        const result = await wrangler.createD1(resource.name);
        return { id: result.uuid };
      }
      case "r2": {
        await wrangler.createR2(resource.name);
        return {};
      }
      case "browser": {
        return {
          warning: `Browser Automation binding "${resource.binding}" for ${app.id} requires manual enablement in the Cloudflare dashboard.`,
        };
      }
      default:
        return {};
    }
  } catch (e) {
    return {
      warning: `Failed to provision ${resource.type} resource "${resource.binding}" for ${app.id}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
