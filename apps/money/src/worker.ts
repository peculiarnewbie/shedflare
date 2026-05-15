import { createRouter } from "./server/router";
import type { AuthEnv } from "@shedflare/auth-client/consumer";

export { MoneyBudgetDO } from "./server/sync-engine";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  BUDGET_DO: DurableObjectNamespace;
  UPLOADS: R2Bucket;
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const router = createRouter(env);
    return router.fetch(request);
  },
} satisfies ExportedHandler<Env>;
