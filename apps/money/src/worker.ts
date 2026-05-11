/**
 * Money worker entry point.
 * Handles auth, session, serves SPA assets, proxies sync to DO.
 */
import { createClient } from "@openauthjs/openauth/client";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import { handleSync } from "./api/sync";
import type { MoneyBudgetDO } from "./server/sync-engine";

// Re-export DO class for Cloudflare
export { MoneyBudgetDO } from "./server/sync-engine";

function getBudgetStub(env: Env): DurableObjectStub {
  const id = env.BUDGET_DO.idFromName("shedflare-money-owner");
  return env.BUDGET_DO.get(id);
}

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  BUDGET_DO: DurableObjectNamespace;
  UPLOADS: R2Bucket;
  APP_PUBLIC_URL: string;
  AUTH_ISSUER_URL: string;
  AUTH_CLIENT_ID: string;
  OWNER_EMAIL: string;
  DEV_AUTH_EMAIL?: string;
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function serializeCookie(
  name: string,
  value: string,
  opts: {
    maxAge?: number;
    expires?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
  } = {},
) {
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  if (opts.maxAge !== undefined) cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.expires !== undefined) cookie += `; Expires=${opts.expires}`;
  cookie += `; Path=${opts.path ?? "/"}`;
  if (opts.secure !== false) cookie += `; Secure`;
  if (opts.httpOnly !== false) cookie += `; HttpOnly`;
  cookie += `; SameSite=${opts.sameSite ?? "Lax"}`;
  return cookie;
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

let jwksUrl: string | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(env: Env) {
  const url = `${env.AUTH_ISSUER_URL}/.well-known/jwks.json`;
  if (!jwks || jwksUrl !== url) {
    jwksUrl = url;
    jwks = createRemoteJWKSet(new URL(url));
  }
  return jwks;
}

type Session = {
  email: string;
  tokens?: {
    access: string;
    refresh: string;
    expiresIn: number;
  };
};

async function getSession(request: Request, env: Env): Promise<Session | null> {
  if (env.DEV_AUTH_EMAIL && isLocalRequest(request))
    return { email: normalizeEmail(env.DEV_AUTH_EMAIL) };
  const accessToken = getCookie(request, "auth_access_token");
  const refreshToken = getCookie(request, "auth_refresh_token");
  if (!accessToken && !refreshToken) return null;

  try {
    if (accessToken) {
      const { payload } = await jwtVerify(accessToken, getJwks(env), {
        issuer: env.AUTH_ISSUER_URL,
      });
      if (payload.mode === "access") {
        const properties = payload.properties as { email?: unknown } | undefined;
        const email =
          typeof properties?.email === "string" ? normalizeEmail(properties.email) : null;
        if (email) return { email };
      }
    }
  } catch (error) {
    if (!(error instanceof joseErrors.JWTExpired) && !refreshToken) return null;
  }

  // Try refresh
  if (refreshToken) {
    try {
      const response = await fetch(`${env.AUTH_ISSUER_URL}/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      if (response.ok) {
        const tokens = (await response.json()) as Record<string, unknown>;
        if (
          typeof tokens.access_token === "string" &&
          typeof tokens.refresh_token === "string" &&
          typeof tokens.expires_in === "number"
        ) {
          const { payload } = await jwtVerify(tokens.access_token, getJwks(env), {
            issuer: env.AUTH_ISSUER_URL,
          });
          const properties = payload.properties as { email?: unknown } | undefined;
          const email =
            typeof properties?.email === "string" ? normalizeEmail(properties.email) : null;
          if (email) {
            return {
              email,
              tokens: {
                access: tokens.access_token,
                refresh: tokens.refresh_token,
                expiresIn: tokens.expires_in,
              },
            };
          }
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function requireOwner(request: Request, env: Env): Promise<Session> {
  const session = await getSession(request, env);
  const email = session?.email;
  if (!email) throw new Response("Unauthorized", { status: 401 });
  if (email !== normalizeEmail(env.OWNER_EMAIL)) throw new Response("Forbidden", { status: 403 });
  return session;
}

// ---------------------------------------------------------------------------
// JSON response helper
// ---------------------------------------------------------------------------

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

// ---------------------------------------------------------------------------
// Root handler
// ---------------------------------------------------------------------------

function logEvent(event: string, details?: Record<string, unknown>) {
  console.log(JSON.stringify({ scope: "money-worker", event, ...details }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      // Auth routes
      if (pathname === "/api/auth/login" && method === "GET") {
        const client = createClient({
          clientID: env.AUTH_CLIENT_ID,
          issuer: env.AUTH_ISSUER_URL,
        });
        const { url: authUrl } = await client.authorize(
          `${env.APP_PUBLIC_URL}/api/auth/callback`,
          "code",
          { provider: "google" },
        );
        return Response.redirect(authUrl, 302);
      }

      if (pathname === "/api/auth/callback" && method === "GET") {
        const code = url.searchParams.get("code");
        if (!code) return new Response("Missing code", { status: 400 });
        const response = await fetch(`${env.AUTH_ISSUER_URL}/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            redirect_uri: `${env.APP_PUBLIC_URL}/api/auth/callback`,
            grant_type: "authorization_code",
            client_id: env.AUTH_CLIENT_ID,
            code_verifier: "",
          }),
        });
        if (!response.ok) {
          return new Response(`Authentication failed: ${await response.text()}`, {
            status: response.status,
          });
        }
        const tokens = (await response.json()) as Record<string, unknown>;
        if (
          typeof tokens.access_token !== "string" ||
          typeof tokens.refresh_token !== "string" ||
          typeof tokens.expires_in !== "number"
        ) {
          return new Response("Invalid token response", { status: 502 });
        }
        const headers = new Headers({ Location: "/" });
        headers.append(
          "Set-Cookie",
          serializeCookie("auth_access_token", tokens.access_token, { maxAge: tokens.expires_in }),
        );
        headers.append(
          "Set-Cookie",
          serializeCookie("auth_refresh_token", tokens.refresh_token, {
            maxAge: 60 * 60 * 24 * 365,
          }),
        );
        return new Response(null, { status: 302, headers });
      }

      if (pathname === "/api/auth/logout" && method === "POST") {
        const headers = new Headers({ Location: "/" });
        const expired = "Thu, 01 Jan 1970 00:00:00 GMT";
        headers.append(
          "Set-Cookie",
          serializeCookie("auth_access_token", "", { maxAge: 0, expires: expired }),
        );
        headers.append(
          "Set-Cookie",
          serializeCookie("auth_refresh_token", "", { maxAge: 0, expires: expired }),
        );
        return new Response(null, { status: 302, headers });
      }

      // Session
      if (pathname === "/api/session" && method === "GET") {
        const session = await getSession(request, env);
        if (!session) return json({ user: null }, { status: 401 });
        const headers = new Headers({ "content-type": "application/json" });
        if (session.tokens) {
          headers.append(
            "Set-Cookie",
            serializeCookie("auth_access_token", session.tokens.access, {
              maxAge: session.tokens.expiresIn,
            }),
          );
          headers.append(
            "Set-Cookie",
            serializeCookie("auth_refresh_token", session.tokens.refresh, {
              maxAge: 60 * 60 * 24 * 365,
            }),
          );
        }
        return new Response(JSON.stringify({ user: { email: session.email } }), { headers });
      }

      // All other API routes proxy to DO (accounts, budget, categories, etc.)
      if (
        pathname.startsWith("/api/") &&
        !pathname.startsWith("/api/auth/") &&
        pathname !== "/api/session" &&
        pathname !== "/api/upload"
      ) {
        try {
          await requireOwner(request, env);
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }
        const stub = getBudgetStub(env);
        const url2 = new URL(request.url);
        return stub.fetch(new Request(url2.toString(), request));
      }

      // File upload (R2 temporary storage for import)
      if (pathname === "/api/upload" && method === "PUT") {
        try {
          await requireOwner(request, env);
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }
        const filename = url.searchParams.get("filename") ?? `import-${Date.now()}.csv`;
        const object = await env.UPLOADS.put(filename, request.body, {
          httpMetadata: { contentType: "text/csv" },
        });
        return json({ filename, uploadedAt: new Date().toISOString() });
      }

      if (pathname.startsWith("/api/upload/") && method === "GET") {
        try {
          await requireOwner(request, env);
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }
        const key = pathname.replace("/api/upload/", "");
        const object = await env.UPLOADS.get(key);
        if (!object) return new Response("Not found", { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        return new Response(object.body, { headers });
      }

      // Serve static assets with SPA fallback
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 404) {
        return await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
      }
      return assetResponse;
    } catch (error) {
      if (error instanceof Response) return error;
      logEvent("unhandled_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
