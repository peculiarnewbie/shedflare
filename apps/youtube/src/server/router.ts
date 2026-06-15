import { createHttpApiWebHandler } from "@shedflare/alchemy";
import { createHttpApiAuth } from "@shedflare/auth-client/http-api";
import { youtubeApi } from "./definitions";
import { createDashboardGroup } from "./impl/dashboard";
import { createWatchLaterGroup } from "./impl/watch-later";
import { createNotificationsGroup } from "./impl/notifications";
import { createSyncGroup } from "./impl/sync";
import type { AuthEnv } from "@shedflare/auth-client/consumer";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  SYNC_SECRET: string;
};

export function createRouter(env: Env) {
  const auth = createHttpApiAuth(env);

  const wh = createHttpApiWebHandler(youtubeApi, [
    createDashboardGroup(env, auth),
    createWatchLaterGroup(env, auth),
    createNotificationsGroup(env, auth),
    createSyncGroup(env),
  ]);

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const { pathname } = url;
      const method = request.method;

      try {
        if (pathname === "/api/auth/login" && method === "GET") {
          const returnTo = auth.validateReturnTo(url.searchParams.get("returnTo"));
          return url.searchParams.get("auto") === "1"
            ? await auth.autoLoginRedirect(returnTo)
            : await auth.loginRedirect(returnTo);
        }
        if (pathname === "/api/auth/callback" && method === "GET") {
          if (url.searchParams.get("error") === "no_session") {
            const redirectUrl = new URL("/", url.origin);
            redirectUrl.searchParams.set("error", "no_session");
            const headers = new Headers({ Location: redirectUrl.toString() });
            headers.append("Set-Cookie", auth.serializeCookie("auth_state", "", { maxAge: 0 }));
            return new Response(null, { status: 302, headers });
          }
          return await auth.handleCallback(request);
        }
        if (pathname === "/api/auth/logout" && method === "POST") return auth.logout();
        if (pathname === "/api/session" && method === "GET")
          return await auth.sessionEndpoint(request);

        if (pathname.startsWith("/api/")) {
          return await wh.handler(request);
        }

        const gate = await auth.gateHtml(request, { publicPaths: ["/forbidden"] });
        if (gate.kind === "redirect") return gate.response;

        let assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status === 404 && auth.isDocumentRequest(request)) {
          assetResponse = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
        }
        return auth.withCookies(assetResponse, gate.setCookies);
      } catch (error) {
        if (error instanceof Response) return error;
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  };
}
