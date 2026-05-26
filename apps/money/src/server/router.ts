import { handleCommand } from "./command-handlers";
import { handleApiRequest } from "./api-handlers";
import { createDrizzleDb } from "./d1-access";
import type { AuthEnv } from "@shedflare/auth-client/consumer";
import { createHttpApiAuth } from "@shedflare/auth-client/http-api";
import { createAuthHandlers } from "@shedflare/auth-client/consumer";
import * as schema from "../db/schema";
import { DataAccess } from "./data-access";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  MONEY_DB: D1Database;
  UPLOADS: R2Bucket;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createRouter(env: Env) {
  const auth = createHttpApiAuth(env);
  const rawAuth = createAuthHandlers(env);
  const drizzle = createDrizzleDb(env.MONEY_DB);
  const access = new DataAccess(env.MONEY_DB, drizzle);

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const method = request.method;

      try {
        // ── Auth routes ──────────────────────────────────────────────
        if (url.pathname === "/api/auth/login" && method === "GET") return auth.loginRedirect();
        if (url.pathname === "/api/auth/callback" && method === "GET")
          return auth.handleCallback(request);
        if (url.pathname === "/api/auth/logout" && method === "POST") return auth.logout();
        if (url.pathname === "/api/session" && method === "GET")
          return auth.sessionEndpoint(request);

        // ── Upload routes ────────────────────────────────────────────
        if (url.pathname === "/api/upload" && method === "PUT") {
          return handleUpload(env);
        }
        if (url.pathname.startsWith("/api/upload/") && method === "GET") {
          return await handleUploadDownload(url, env);
        }

        // ── Require session for API routes ───────────────────────────
        await rawAuth.requireSession(request);

        // ── Command endpoint ─────────────────────────────────────────
        if (url.pathname === "/api/command" && method === "POST") {
          const body = await request.json();
          const result = handleCommand(env.MONEY_DB, drizzle, body as Record<string, unknown>);
          if ("error" in result) {
            return json({ error: result.error }, 400);
          }
          return json(result);
        }

        // ── Full data dump ───────────────────────────────────────────
        if (url.pathname === "/api/data" && method === "GET") {
          return handleGetData(drizzle);
        }

        // ── Read endpoints (delegated to api-handlers) ────────────────
        const apiResponse = handleApiRequest(url, method, access);
        if (apiResponse) return apiResponse;

        // ── Assets ───────────────────────────────────────────────────
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

// ── Upload helpers ────────────────────────────────────────────────

function handleUpload(_env: Env): Response {
  return new Response("Upload endpoint needs reimplementation", { status: 501 });
}

function handleUploadDownload(url: URL, env: Env): Promise<Response> {
  const key = url.pathname.replace("/api/upload/", "");
  return env.UPLOADS.get(key)
    .then((obj) => {
      if (!obj) return new Response("Not found", { status: 404 });
      return new Response(obj.body, {
        headers: {
          "content-type": (obj as any).httpMetadata?.contentType ?? "application/octet-stream",
        },
      });
    })
    .catch(() => new Response("Not found", { status: 404 }));
}

// ── Data dump endpoint ────────────────────────────────────────────

function handleGetData(drizzle: any): Response {
  const tableNames = Object.keys(schema);
  const data: Record<string, Record<string, unknown>> = {};

  for (const name of tableNames) {
    const tableDef = (schema as any)[name];
    if (!tableDef || !tableDef._meta) continue; // skip non-tables

    try {
      const rows = drizzle.select().from(tableDef).all() as Record<string, unknown>[];
      data[name] = {};
      for (const row of rows) {
        const id = (row as any).id ?? (row as any).key ?? null;
        if (id) data[name][String(id)] = row;
      }
    } catch {
      // Skip tables that don't exist or can't be queried
    }
  }

  return json({ data });
}
