import { createHttpApiWebHandler } from "@shedflare/alchemy";
import { createHttpApiAuth } from "@shedflare/auth-client/http-api";
import { driveApi } from "./definitions";
import { createFileHandlersGroup } from "./impl/files";
import { createTagsGroup } from "./impl/tags";
import type { AuthEnv } from "@shedflare/auth-client/consumer";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  FILES: R2Bucket;
};

export function createRouter(env: Env) {
  const auth = createHttpApiAuth(env);

  const wh = createHttpApiWebHandler(driveApi, [
    createFileHandlersGroup(env, auth),
    createTagsGroup(env, auth),
  ]);

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const { pathname } = url;
      const method = request.method;

      try {
        if (pathname === "/api/auth/login" && method === "GET") return auth.loginRedirect();
        if (pathname === "/api/auth/callback" && method === "GET")
          return auth.handleCallback(request);
        if (pathname === "/api/auth/logout" && method === "POST") return auth.logout();
        if (pathname === "/api/session" && method === "GET") return auth.sessionEndpoint(request);

        if (pathname.startsWith("/api/")) {
          return wh.handler(request);
        }

        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status === 404) {
          return env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
        }
        return assetResponse;
      } catch (error) {
        if (error instanceof Response) return error;
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  };
}
