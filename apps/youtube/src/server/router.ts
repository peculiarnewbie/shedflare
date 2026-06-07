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

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

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
          return url.searchParams.get("auto") === "1"
            ? await auth.autoLoginRedirect()
            : await auth.loginRedirect();
        }
        if (pathname === "/api/auth/callback" && method === "GET") {
          if (url.searchParams.get("error") === "no_session") {
            const redirectUrl = new URL("/", url.origin);
            redirectUrl.searchParams.set("error", "no_session");
            return Response.redirect(redirectUrl.toString(), 302);
          }
          return await auth.handleCallback(request);
        }
        if (pathname === "/api/auth/logout" && method === "POST") return auth.logout();
        if (pathname === "/api/session" && method === "GET")
          return await auth.sessionEndpoint(request);

        if (pathname.startsWith("/api/")) {
          return await wh.handler(request);
        }

        if (!getCookie(request, "auth_access_token")) {
          return Response.redirect(new URL("/api/auth/login?auto=1", url.origin).toString(), 302);
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
