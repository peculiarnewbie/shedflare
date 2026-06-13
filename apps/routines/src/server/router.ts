import { createHttpApiAuth } from "@shedflare/auth-client/http-api";
import { createAuthHandlers } from "@shedflare/auth-client/consumer";
import { db } from "./db";
import { ensureSchema } from "./init";
import * as handlers from "./handlers";
import type { AuthEnv } from "@shedflare/auth-client/consumer";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
};

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function createRouter(env: Env) {
  const auth = createHttpApiAuth(env);
  const rawAuth = createAuthHandlers(env);
  const database = db(env.DB);

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const { pathname } = url;
      const method = request.method;

      try {
        // ── Auth routes ──────────────────────────────────────────────
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

        // ── All other API routes require a session ───────────────────
        if (pathname.startsWith("/api/")) {
          await rawAuth.requireSession(request);
          await ensureSchema(env.DB);

          if (pathname === "/api/routines/day" && method === "GET") {
            return await handlers.getDay(database, url.searchParams.get("date"));
          }
          if (pathname === "/api/routines" && method === "GET") {
            return await handlers.listRoutines(database);
          }
          if (pathname === "/api/routines" && method === "POST") {
            return await handlers.createRoutine(database, await request.json());
          }

          const routineIdMatch = pathname.match(/^\/api\/routines\/([^/]+)$/);
          if (routineIdMatch && method === "PUT") {
            return await handlers.updateRoutine(database, routineIdMatch[1], await request.json());
          }
          if (routineIdMatch && method === "DELETE") {
            return await handlers.deleteRoutine(database, routineIdMatch[1]);
          }

          if (pathname === "/api/routines/completion" && method === "POST") {
            return await handlers.toggleCompletion(database, await request.json());
          }
          if (pathname === "/api/routines/reorder" && method === "POST") {
            return await handlers.reorderRoutines(database, await request.json());
          }

          if (pathname === "/api/routines/completions" && method === "GET") {
            return await handlers.getCompletions(
              database,
              url.searchParams.get("from"),
              url.searchParams.get("to"),
            );
          }

          if (pathname === "/api/routines/settings/sleep-time" && method === "POST") {
            return await handlers.setSleepTime(database, await request.json());
          }

          return new Response("Not Found", { status: 404 });
        }

        // ── Assets ───────────────────────────────────────────────────
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
        console.error("Router error:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  };
}
