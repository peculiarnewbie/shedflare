import { createRouter } from "./server/router";
import type { AppEnv } from "#/effect";

export { SyncEngineDurableObject } from "./server/sync-engine";

type Env = Omit<AppEnv, "OPENCODE_GO_API_KEY" | "UPLOAD_TOKEN_SECRET" | "EXA_API_KEY"> & {
  OPENCODE_GO_API_KEY: { get(): Promise<string> };
  UPLOAD_TOKEN_SECRET: { get(): Promise<string> };
  EXA_API_KEY?: { get(): Promise<string> };
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const router = createRouter(env);
    return router.fetch(request);
  },
} satisfies ExportedHandler<Env>;
