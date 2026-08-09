import type { DiscordEnv } from "#/env";
import { GATEWAY_WEBHOOK_HEADER } from "#/gateway/protocol";
import { getGatewayStub } from "#/gateway/stub";
import { handleGatewayWebhookEvent } from "#/handlers/message-create";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

function requireAdmin(request: Request, env: DiscordEnv): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return header.slice("Bearer ".length) === env.GATEWAY_ADMIN_SECRET;
}

export async function routeRequest(
  request: Request,
  env: DiscordEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/" && request.method === "GET") {
    return new Response("Shedflare Discord", { status: 200 });
  }

  if (url.pathname === "/internal/gateway" && request.method === "POST") {
    const token = request.headers.get(GATEWAY_WEBHOOK_HEADER);
    if (!token || token !== env.GATEWAY_WEBHOOK_SECRET) return unauthorized();

    const event = (await request.json()) as Parameters<typeof handleGatewayWebhookEvent>[0];
    ctx.waitUntil(handleGatewayWebhookEvent(event, env));
    return new Response("OK", { status: 200 });
  }

  if (url.pathname === "/admin/gateway/status" && request.method === "GET") {
    if (!requireAdmin(request, env)) return unauthorized();
    const gateway = getGatewayStub(env.DISCORD_GATEWAY);
    return json(await gateway.status());
  }

  if (url.pathname === "/admin/gateway/connect" && request.method === "POST") {
    if (!requireAdmin(request, env)) return unauthorized();
    const gateway = getGatewayStub(env.DISCORD_GATEWAY);
    const webhookUrl = new URL("/internal/gateway", env.APP_PUBLIC_URL).toString();
    const result = await gateway.startGateway({
      botToken: env.DISCORD_BOT_TOKEN,
      webhookUrl,
      webhookSecret: env.GATEWAY_WEBHOOK_SECRET,
    });
    return json(result);
  }

  if (url.pathname === "/admin/gateway/disconnect" && request.method === "POST") {
    if (!requireAdmin(request, env)) return unauthorized();
    const gateway = getGatewayStub(env.DISCORD_GATEWAY);
    return json(await gateway.disconnect());
  }

  return new Response("Not found", { status: 404 });
}

export async function ensureGatewayConnected(env: DiscordEnv): Promise<void> {
  const gateway = getGatewayStub(env.DISCORD_GATEWAY);
  const status = await gateway.status();
  if (status.status === "connected" || status.reconnectDisabled) return;

  const webhookUrl = new URL("/internal/gateway", env.APP_PUBLIC_URL).toString();
  await gateway.startGateway({
    botToken: env.DISCORD_BOT_TOKEN,
    webhookUrl,
    webhookSecret: env.GATEWAY_WEBHOOK_SECRET,
  });
}
