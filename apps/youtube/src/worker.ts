import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createAuthHandlers, type AuthEnv } from "@shedflare/auth-client/consumer";
import { notifications, watchLaterVideos } from "./db/schema";
import type { SyncPayload } from "./api";

type Env = AuthEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  SYNC_SECRET: SecretsStoreSecret;
};

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function parseJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
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

async function handleWatchLaterList(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuthHandlers>,
) {
  const session = await auth.requireSession(request);
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
  return auth.withSessionCookies(json({ videos: rows }), session);
}

async function handleWatchLaterPrune(
  request: Request,
  env: Env,
  videoId: string,
  auth: ReturnType<typeof createAuthHandlers>,
) {
  const session = await auth.requireSession(request);
  const db = getDb(env);
  await db
    .update(watchLaterVideos)
    .set({ pruned: true })
    .where(eq(watchLaterVideos.videoId, videoId))
    .run();
  return auth.withSessionCookies(json({ ok: true }), session);
}

async function handleWatchLaterUnprune(
  request: Request,
  env: Env,
  videoId: string,
  auth: ReturnType<typeof createAuthHandlers>,
) {
  const session = await auth.requireSession(request);
  const db = getDb(env);
  await db
    .update(watchLaterVideos)
    .set({ pruned: false })
    .where(eq(watchLaterVideos.videoId, videoId))
    .run();
  return auth.withSessionCookies(json({ ok: true }), session);
}

async function handleNotifList(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuthHandlers>,
) {
  const session = await auth.requireSession(request);
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
  return auth.withSessionCookies(json({ notifications: rows }), session);
}

async function handleNotifRead(
  request: Request,
  env: Env,
  id: string,
  auth: ReturnType<typeof createAuthHandlers>,
) {
  const session = await auth.requireSession(request);
  const db = getDb(env);
  await db.update(notifications).set({ read: true }).where(eq(notifications.id, id)).run();
  return auth.withSessionCookies(json({ ok: true }), session);
}

async function handleNotifReadAll(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuthHandlers>,
) {
  const session = await auth.requireSession(request);
  const db = getDb(env);
  await db.update(notifications).set({ read: true }).run();
  return auth.withSessionCookies(json({ ok: true }), session);
}

async function handleDashboard(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuthHandlers>,
) {
  const session = await auth.requireSession(request);
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
  return auth.withSessionCookies(
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
    const auth = createAuthHandlers(env);

    try {
      if (!pathname.startsWith("/api/")) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status === 404) {
          return await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
        }
        return assetResponse;
      }

      if (pathname === "/api/auth/login" && request.method === "GET")
        return await auth.loginRedirect();
      if (pathname === "/api/auth/callback" && request.method === "GET")
        return await auth.handleCallback(request);
      if (pathname === "/api/auth/logout" && request.method === "POST") return auth.logout();
      if (pathname === "/api/session" && request.method === "GET")
        return await auth.sessionEndpoint(request);
      if (pathname === "/api/dashboard" && request.method === "GET")
        return await handleDashboard(request, env, auth);
      if (pathname === "/api/sync" && request.method === "POST")
        return await handleSync(request, env);
      if (pathname === "/api/watch-later" && request.method === "GET")
        return await handleWatchLaterList(request, env, auth);
      if (pathname === "/api/notifications" && request.method === "GET")
        return await handleNotifList(request, env, auth);
      if (pathname === "/api/notifications/read-all" && request.method === "POST")
        return await handleNotifReadAll(request, env, auth);

      const pruneMatch = pathname.match(/^\/api\/watch-later\/([^/]+)\/prune$/);
      if (pruneMatch && request.method === "POST")
        return await handleWatchLaterPrune(request, env, decodeURIComponent(pruneMatch[1]), auth);
      const unpruneMatch = pathname.match(/^\/api\/watch-later\/([^/]+)\/unprune$/);
      if (unpruneMatch && request.method === "POST")
        return await handleWatchLaterUnprune(
          request,
          env,
          decodeURIComponent(unpruneMatch[1]),
          auth,
        );
      const notifReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
      if (notifReadMatch && request.method === "POST")
        return await handleNotifRead(request, env, decodeURIComponent(notifReadMatch[1]), auth);

      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof Response) return error;
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
