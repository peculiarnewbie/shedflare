import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createHttpApiWebHandler } from "@shedflare/alchemy";
import { createHttpApiAuth } from "@shedflare/auth-client/http-api";
import { links } from "../db/schema";
import { shortApi } from "./definitions";
import { createLinksGroup } from "./impl/links";
import type { AuthEnv } from "@shedflare/auth-client/consumer";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
};

export function createRouter(env: Env) {
  const auth = createHttpApiAuth(env);
  const wh = createHttpApiWebHandler(shortApi, [createLinksGroup(env, auth)]);

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const { pathname } = url;
      const method = request.method;

      try {
        if (pathname === "/api/auth/login" && method === "GET") return await auth.loginRedirect();
        if (pathname === "/api/auth/callback" && method === "GET")
          return await auth.handleCallback(request);
        if (pathname === "/api/auth/logout" && method === "POST") return auth.logout();
        if (pathname === "/api/session" && method === "GET")
          return await auth.sessionEndpoint(request);

        if (pathname.startsWith("/api/")) {
          return await wh.handler(request);
        }

        const slug = pathname.slice(1);
        if (slug && !slug.includes("/") && slug !== "favicon.ico") {
          const db = drizzle(env.DB);
          const row = await db.select().from(links).where(eq(links.slug, slug)).get();
          if (row) {
            return Response.redirect(row.url, 301);
          }
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
