import type { CfInventory } from "./inventory-service.ts";
import { discoverAppIds } from "./config-service.ts";
import { resolveDeployStage } from "./env.ts";

/**
 * Naming pattern: shedflare-{stage}-{appId}
 * This regex matches the prefix and captures the suffix after "shedflare-".
 */
const SHEDFLARE_WORKER_RE = /^shedflare-(.+)$/;

/**
 * Discover all stages deployed to Cloudflare by scanning worker names.
 *
 * For each worker whose name matches shedflare-{stage}-{appId} (where appId
 * is a known app from the local filesystem), extracts the stage name.
 * Returns the deduplicated, sorted list.
 */
export function discoverStagesFromInventory(
  inventory: CfInventory,
  knownAppIds = discoverAppIds(),
): string[] {
  const stages = new Set<string>();

  for (const worker of inventory.workers) {
    const match = worker.id.match(SHEDFLARE_WORKER_RE);
    if (!match) continue;

    const suffix = match[1]; // e.g. "prod-chat" or "dev-bolt-chat"

    // Try matching known app IDs from the end of the suffix.
    // We sort longest-first to avoid ambiguous matches (e.g. "s" matching
    // before "chat" if both exist).
    const sorted = [...knownAppIds].sort((a, b) => b.length - a.length);
    for (const appId of sorted) {
      if (suffix.endsWith(`-${appId}`) && suffix.length > appId.length + 1) {
        const stage = suffix.slice(0, -(appId.length + 1));
        if (stage) {
          stages.add(stage);
        }
        break;
      }
    }
  }

  return [...stages].sort();
}

/**
 * Resolve the current stage — first checks the ALCHEMY_STAGE env var,
 * falls back to scanning the Cloudflare inventory for stages, defaults to "prod".
 */
export function resolveCurrentStage(
  inventory: CfInventory,
  knownAppIds = discoverAppIds(),
): string {
  const fromEnv = resolveDeployStage();
  // If ALCHEMY_STAGE was explicitly set, honour it.
  if (process.env.ALCHEMY_STAGE) return fromEnv;

  const stages = discoverStagesFromInventory(inventory, knownAppIds);
  if (stages.length === 0) return "prod";

  // Prefer "prod" if it exists, otherwise the first discovered stage.
  if (stages.includes("prod")) return "prod";
  return stages[0];
}
