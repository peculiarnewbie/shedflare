import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createClient } from "@openauthjs/openauth/client";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import { notifications, watchLaterVideos } from "./db/schema";
import type { SyncPayload } from "./api";

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  APP_PUBLIC_URL: string;
  AUTH_ISSUER_URL: string;
  AUTH_CLIENT_ID: string;
  OWNER_EMAIL: string;
  SYNC_SECRET: SecretsStoreSecret;
  DEV_AUTH_EMAIL?: string;
};

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function parseJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function serializeCookie(
  name: string,
  value: string,
  opts: {
    maxAge?: number;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
  } = {},
) {
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  if (opts.maxAge !== undefined) cookie += `; Max-Age=${opts.maxAge}`;
  cookie += `; Path=${opts.path ?? "/"}`;
  if (opts.secure !== false) cookie += `; Secure`;
  if (opts.httpOnly !== false) cookie += `; HttpOnly`;
  cookie += `; SameSite=${opts.sameSite ?? "Lax"}`;
  return cookie;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
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

type AccessVerifyResult = { kind: "ok"; email: string } | { kind: "expired" } | { kind: "invalid" };

async function verifyAccessToken(token: string, env: Env): Promise<AccessVerifyResult> {
  try {
    const { payload } = await jwtVerify(token, getJwks(env), { issuer: env.AUTH_ISSUER_URL });
    if (payload.mode !== "access") return { kind: "invalid" };
    const properties = payload.properties as { email?: unknown } | undefined;
    return typeof properties?.email === "string"
      ? { kind: "ok", email: normalizeEmail(properties.email) }
      : { kind: "invalid" };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) return { kind: "expired" };
    return { kind: "invalid" };
  }
}

async function parseTokenResponse(response: Response) {
  const jsonBody = await response.json().catch(() => null);
  if (!jsonBody || typeof jsonBody !== "object" || Array.isArray(jsonBody)) return null;
  const tokens = jsonBody as Record<string, unknown>;
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string" ||
    typeof tokens.expires_in !== "number"
  )
    return null;
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  };
}

async function rotateRefreshToken(refreshToken: string, env: Env) {
  const response = await fetch(`${env.AUTH_ISSUER_URL}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!response.ok) return null;
  return await parseTokenResponse(response);
}

async function getSession(request: Request, env: Env) {
  if (env.DEV_AUTH_EMAIL && isLocalRequest(request))
    return { email: normalizeEmail(env.DEV_AUTH_EMAIL) };
  const accessToken = getCookie(request, "auth_access_token");
  const refreshToken = getCookie(request, "auth_refresh_token");
  if (!accessToken && !refreshToken) return null;
  const verified = accessToken
    ? await verifyAccessToken(accessToken, env)
    : { kind: "invalid" as const };
  if (verified.kind === "ok") return { email: verified.email };
  if (refreshToken) {
    const rotated = await rotateRefreshToken(refreshToken, env);
    if (!rotated) return null;
    const reverified = await verifyAccessToken(rotated.accessToken, env);
    if (reverified.kind !== "ok") return null;
    return { email: reverified.email, tokens: rotated };
  }
  return null;
}

function withSessionCookies(
  response: Response,
  session: { tokens?: { accessToken: string; expiresIn: number } },
) {
  if (!session.tokens) return response;
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    serializeCookie("auth_access_token", session.tokens.accessToken, {
      maxAge: session.tokens.expiresIn,
    }),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function requireOwner(request: Request, env: Env) {
  const session = await getSession(request, env);
  if (!session?.email) throw new Response("Unauthorized", { status: 401 });
  if (session.email !== normalizeEmail(env.OWNER_EMAIL))
    throw new Response("Forbidden", { status: 403 });
  return session;
}

function getDb(env: Env) {
  return drizzle(env.DB);
}

async function handleSync(request: Request, env: Env) {
  const secret = request.headers.get("x-sync-secret");
  if (!secret || secret !== (await env.SYNC_SECRET.get())) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await parseJson(request)) as SyncPayload | null;
  if (!body || !body.syncedAt) {
    return json({ error: "Invalid payload" }, { status: 400 });
  }

  const db = getDb(env);
  const syncedAt = body.syncedAt;

  if (body.watchLater) {
    await db.delete(watchLaterVideos);
    if (body.watchLater.length > 0) {
      await db
        .insert(watchLaterVideos)
        .values(
          body.watchLater.map((v) => ({
            videoId: v.videoId,
            title: v.title,
            channelId: v.channelId,
            channelName: v.channelName,
            durationSeconds: v.durationSeconds ?? null,
            thumbnailUrl: v.thumbnailUrl ?? null,
            publishedAt: v.publishedAt ?? null,
            addedAt: v.addedAt ?? null,
            sortOrder: v.sortOrder,
            syncedAt,
          })),
        )
        .run();
    }
  }

  if (body.notifications) {
    for (const n of body.notifications) {
      await db
        .insert(notifications)
        .values({
          id: n.id,
          channelId: n.channelId ?? null,
          channelName: n.channelName,
          channelAvatarUrl: n.channelAvatarUrl ?? null,
          videoId: n.videoId ?? null,
          title: n.title,
          type: n.type,
          timestamp: n.timestamp,
          syncedAt,
        })
        .onConflictDoNothing()
        .run();
    }
  }

  return json({ ok: true, syncedAt });
}

async function handleWatchLaterList(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const url = new URL(request.url);
  const showPruned = url.searchParams.get("pruned") === "true";
  const conditions = showPruned ? undefined : eq(watchLaterVideos.pruned, false);
  const rows = await db
    .select()
    .from(watchLaterVideos)
    .where(conditions)
    .orderBy(desc(watchLaterVideos.sortOrder))
    .all();
  return withSessionCookies(json({ videos: rows }), session);
}

async function handleWatchLaterPrune(request: Request, env: Env, videoId: string) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  await db
    .update(watchLaterVideos)
    .set({ pruned: true })
    .where(eq(watchLaterVideos.videoId, videoId))
    .run();
  return withSessionCookies(json({ ok: true }), session);
}

async function handleWatchLaterUnprune(request: Request, env: Env, videoId: string) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  await db
    .update(watchLaterVideos)
    .set({ pruned: false })
    .where(eq(watchLaterVideos.videoId, videoId))
    .run();
  return withSessionCookies(json({ ok: true }), session);
}

async function handleNotifList(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const url = new URL(request.url);
  const showUnread = url.searchParams.get("unread") === "true";
  const conditions = showUnread ? eq(notifications.read, false) : undefined;
  const rows = await db
    .select()
    .from(notifications)
    .where(conditions)
    .orderBy(desc(notifications.timestamp))
    .all();
  return withSessionCookies(json({ notifications: rows }), session);
}

async function handleNotifRead(request: Request, env: Env, id: string) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  await db.update(notifications).set({ read: true }).where(eq(notifications.id, id)).run();
  return withSessionCookies(json({ ok: true }), session);
}

async function handleNotifReadAll(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  await db.update(notifications).set({ read: true }).run();
  return withSessionCookies(json({ ok: true }), session);
}

async function handleSession(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const headers = new Headers({ "content-type": "application/json" });
  if (session.tokens) {
    headers.append(
      "Set-Cookie",
      serializeCookie("auth_access_token", session.tokens.accessToken, {
        maxAge: session.tokens.expiresIn,
      }),
    );
  }
  return new Response(JSON.stringify({ user: { email: session.email } }), { headers });
}

async function handleLogin(env: Env) {
  const client = createClient({ clientID: env.AUTH_CLIENT_ID, issuer: env.AUTH_ISSUER_URL });
  const { url } = await client.authorize(`${env.APP_PUBLIC_URL}/api/auth/callback`, "code", {
    provider: "google",
  });
  return Response.redirect(url, 302);
}

async function handleCallback(request: Request, env: Env) {
  const code = new URL(request.url).searchParams.get("code");
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
  if (!response.ok)
    return new Response(`Authentication failed: ${await response.text()}`, {
      status: response.status,
    });
  const tokens = await parseTokenResponse(response);
  if (!tokens) return new Response("Invalid token response", { status: 502 });
  const headers = new Headers({ Location: "/" });
  headers.append(
    "Set-Cookie",
    serializeCookie("auth_access_token", tokens.accessToken, { maxAge: tokens.expiresIn }),
  );
  return new Response(null, { status: 302, headers });
}

function handleLogout() {
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", serializeCookie("auth_access_token", "", { maxAge: 0 }));
  return new Response(null, { status: 302, headers });
}

async function handleDashboard(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const [wlRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(watchLaterVideos)
    .where(eq(watchLaterVideos.pruned, false))
    .all();
  const wlCount = wlRow?.value ?? 0;
  const [unreadRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(notifications)
    .where(eq(notifications.read, false))
    .all();
  const unreadCount = unreadRow?.value ?? 0;
  const [totalRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(notifications)
    .all();
  const recentWl = await db
    .select()
    .from(watchLaterVideos)
    .where(eq(watchLaterVideos.pruned, false))
    .orderBy(desc(watchLaterVideos.syncedAt))
    .limit(5)
    .all();
  const recentNotifs = await db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.timestamp))
    .limit(5)
    .all();
  return withSessionCookies(
    json({
      watchLaterCount: wlCount,
      unreadNotifCount: unreadCount,
      totalNotifs: totalRow?.value ?? 0,
      recentWatchLater: recentWl,
      recentNotifications: recentNotifs,
    }),
    session,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (!pathname.startsWith("/api/")) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status === 404) {
          return await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
        }
        return assetResponse;
      }

      if (pathname === "/api/auth/login" && request.method === "GET") return await handleLogin(env);
      if (pathname === "/api/auth/callback" && request.method === "GET")
        return await handleCallback(request, env);
      if (pathname === "/api/auth/logout" && request.method === "POST") return handleLogout();
      if (pathname === "/api/session" && request.method === "GET")
        return await handleSession(request, env);
      if (pathname === "/api/dashboard" && request.method === "GET")
        return await handleDashboard(request, env);
      if (pathname === "/api/sync" && request.method === "POST")
        return await handleSync(request, env);
      if (pathname === "/api/watch-later" && request.method === "GET")
        return await handleWatchLaterList(request, env);
      if (pathname === "/api/notifications" && request.method === "GET")
        return await handleNotifList(request, env);
      if (pathname === "/api/notifications/read-all" && request.method === "POST")
        return await handleNotifReadAll(request, env);

      const pruneMatch = pathname.match(/^\/api\/watch-later\/([^/]+)\/prune$/);
      if (pruneMatch && request.method === "POST")
        return await handleWatchLaterPrune(request, env, decodeURIComponent(pruneMatch[1]));
      const unpruneMatch = pathname.match(/^\/api\/watch-later\/([^/]+)\/unprune$/);
      if (unpruneMatch && request.method === "POST")
        return await handleWatchLaterUnprune(request, env, decodeURIComponent(unpruneMatch[1]));
      const notifReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
      if (notifReadMatch && request.method === "POST")
        return await handleNotifRead(request, env, decodeURIComponent(notifReadMatch[1]));

      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof Response) return error;
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
