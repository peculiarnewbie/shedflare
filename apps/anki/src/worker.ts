import type { AuthEnv } from "@shedflare/auth-client/consumer";
import { createRouter } from "./server/router";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return createRouter(env).fetch(request);
  },
} satisfies ExportedHandler<Env>;
