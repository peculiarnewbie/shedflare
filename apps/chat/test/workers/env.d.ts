import type { SyncEngineDurableObject } from "../../src/server/sync-engine";

declare global {
  namespace Cloudflare {
    interface Env {
      SYNC_ENGINE: DurableObjectNamespace<SyncEngineDurableObject>;
    }
  }
}

export {};
