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

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function createRouter(env: Env) {
  const auth = createHttpApiAuth(env);
  const wh = createHttpApiWebHandler(shortApi, [createLinksGroup(env, auth)]);

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

        const slug = pathname.slice(1);
        if (slug && !slug.includes("/") && slug !== "favicon.ico") {
          const db = drizzle(env.DB);
          const row = await db.select().from(links).where(eq(links.slug, slug)).get();
          if (row) {
            if (row.hidePreview) {
              const safeUrl = row.url
                .replace(/&/g, "&amp;")
                .replace(/"/g, "&quot;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
              const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="Link">
<meta property="og:description" content="">
<meta name="twitter:card" content="summary">
<title>Redirecting…</title>
<meta http-equiv="refresh" content="0;url=${safeUrl}">
<script>location.replace(${JSON.stringify(row.url)})</script>
</head>
<body>
<p>Redirecting to <a href="${safeUrl}">${safeUrl}</a>…</p>
</body>
</html>`;
              return new Response(html, {
                headers: { "content-type": "text/html; charset=utf-8" },
              });
            }
            return Response.redirect(row.url, 301);
          }
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
