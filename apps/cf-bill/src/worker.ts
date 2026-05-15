import { createRouter } from "./server/router";
import type { AuthEnv } from "@shedflare/auth-client/consumer";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CF_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_ZONE_ID?: string;
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const router = createRouter(env);
    return router.fetch(request);
  },
} satisfies ExportedHandler<Env>;
