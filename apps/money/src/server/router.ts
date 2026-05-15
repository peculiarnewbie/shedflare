import { Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpRouter } from "effect/unstable/http";
import { createHttpApiAuth } from "@shedflare/auth-client/http-api";
import { createAuthHandlers, type AuthEnv } from "@shedflare/auth-client/consumer";
import { moneyApi } from "./definitions";
import { createUploadsGroup } from "./impl/uploads";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  BUDGET_DO: DurableObjectNamespace;
  UPLOADS: R2Bucket;
};

const SINGLE_USER_DO_ID = "shedflare-money-owner";

export function createRouter(env: Env) {
  const auth = createHttpApiAuth(env);
  const rawAuth = createAuthHandlers(env);

  const implLayer = Layer.mergeAll(createUploadsGroup(env, auth));

  const combinedLayer = Layer.provide(
    HttpApiBuilder.layer(moneyApi as any) as any,
    implLayer as any,
  );
  const wh = HttpRouter.toWebHandler(combinedLayer as any) as any;

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

        if (pathname === "/api/upload" && method === "PUT") return wh.handler(request);
        if (pathname.startsWith("/api/upload/") && method === "GET") return wh.handler(request);

        if (
          pathname.startsWith("/api/") &&
          !pathname.startsWith("/api/auth/") &&
          pathname !== "/api/session"
        ) {
          try {
            await rawAuth.requireSession(request);
          } catch {
            return new Response("Unauthorized", { status: 401 });
          }
          const stub = env.BUDGET_DO.get(env.BUDGET_DO.idFromName(SINGLE_USER_DO_ID));
          return stub.fetch(new Request(url.toString(), request));
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
