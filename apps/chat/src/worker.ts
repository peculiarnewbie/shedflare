import { createRouter } from "./server/router";
import type { AppEnv } from "#/effect";

export { SyncEngineDurableObject } from "./server/sync-engine";

type Env = AppEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SYNC_ENGINE: DurableObjectNamespace;
  UPLOADS: R2Bucket;
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const router = createRouter(env);
    return router.fetch(request);
  },
} satisfies ExportedHandler<Env>;
