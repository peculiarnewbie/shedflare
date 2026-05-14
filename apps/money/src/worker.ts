import { createAuthHandlers, type AuthEnv } from "@shedflare/auth-client/consumer";
import type { MoneyBudgetDO } from "./server/sync-engine";

export { MoneyBudgetDO } from "./server/sync-engine";

function getBudgetStub(env: Env): DurableObjectStub {
  const id = env.BUDGET_DO.idFromName("shedflare-money-owner");
  return env.BUDGET_DO.get(id);
}

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  BUDGET_DO: DurableObjectNamespace;
  UPLOADS: R2Bucket;
};

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function logEvent(event: string, details?: Record<string, unknown>) {
  console.log(JSON.stringify({ scope: "money-worker", event, ...details }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    const auth = createAuthHandlers(env);

    try {
      // Auth routes
      if (pathname === "/api/auth/login" && method === "GET") {
        return await auth.loginRedirect();
      }

      if (pathname === "/api/auth/callback" && method === "GET") {
        return await auth.handleCallback(request);
      }

      if (pathname === "/api/auth/logout" && method === "POST") {
        return auth.logout();
      }

      // Session
      if (pathname === "/api/session" && method === "GET") {
        return await auth.sessionEndpoint(request);
      }

      // All other API routes proxy to DO (accounts, budget, categories, etc.)
      if (
        pathname.startsWith("/api/") &&
        !pathname.startsWith("/api/auth/") &&
        pathname !== "/api/session" &&
        pathname !== "/api/upload"
      ) {
        try {
          await auth.requireSession(request);
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
          await auth.requireSession(request);
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }
        const filename = url.searchParams.get("filename") ?? `import-${Date.now()}.csv`;
        await env.UPLOADS.put(filename, request.body, {
          httpMetadata: { contentType: "text/csv" },
        });
        return json({ filename, uploadedAt: new Date().toISOString() });
      }

      if (pathname.startsWith("/api/upload/") && method === "GET") {
        try {
          await auth.requireSession(request);
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
