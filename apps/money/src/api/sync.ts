/**
 * Sync API handler — proxies WebSocket and HTTP sync requests to the DO.
 */

type Env = {
  BUDGET_DO: DurableObjectNamespace;
  APP_PUBLIC_URL: string;
  AUTH_ISSUER_URL: string;
  AUTH_CLIENT_ID: string;
  OWNER_EMAIL: string;
  DEV_AUTH_EMAIL?: string;
};

/**
 * Get the DO stub for a given user.
 * Since this is a single-owner deployment, the DO ID is fixed.
 */
function getBudgetStub(env: Env): DurableObjectStub {
  const id = env.BUDGET_DO.idFromName("shedflare-money-owner");
  return env.BUDGET_DO.get(id);
}

/**
 * Handle sync requests: WebSocket (ws) and internal HTTP commands.
 */
export async function handleSync(request: Request, env: Env): Promise<Response> {
  const stub = getBudgetStub(env);
  const url = new URL(request.url);
  const suffix = url.pathname.split("/").pop() ?? "";

  // WebSocket upgrade
  if (suffix === "ws") {
    url.pathname = "/ws";
    return stub.fetch(new Request(url.toString(), request));
  }

  // Internal command endpoint
  if (suffix === "command" && request.method === "POST") {
    url.pathname = "/internal/command";
    return stub.fetch(new Request(url.toString(), request));
  }

  // Snapshot (debug)
  if (suffix === "snapshot") {
    url.pathname = "/internal/snapshot";
    return stub.fetch(new Request(url.toString(), request));
  }

  return new Response("Not found", { status: 404 });
}
