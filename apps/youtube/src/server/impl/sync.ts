import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerResponse } from "effect/unstable/http";
import { drizzle } from "drizzle-orm/d1";
import { notifications, watchLaterVideos } from "../../db/schema";
import { youtubeApi } from "../definitions";

export interface SyncSecretEnv {
  DB: D1Database;
  SYNC_SECRET: { get(): Promise<string> };
}

export function createSyncGroup(env: SyncSecretEnv) {
  const endpoint = (youtubeApi as any).groups["sync"].endpoints["sync"];
  return (HttpApiBuilder.group as any)(youtubeApi, "sync", (handlers: any) => {
    handlers.handlers.set("sync", {
      endpoint,
      handler: (ctx: any) =>
        Effect.gen(function* () {
          const secret = yield* Effect.tryPromise(() => env.SYNC_SECRET.get());
          const authHeader = ctx.request.headers["x-sync-secret"];
          if (!authHeader || authHeader !== secret) {
            return HttpServerResponse.fromWeb(
              new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "content-type": "application/json" },
              }),
            );
          }

          const body = ctx.payload as {
            syncedAt: string;
            watchLater?: any[];
            notifications?: any[];
          } | null;
          if (!body || !body.syncedAt) {
            return HttpServerResponse.fromWeb(
              new Response(JSON.stringify({ error: "Invalid payload" }), {
                status: 400,
                headers: { "content-type": "application/json" },
              }),
            );
          }

          const db = drizzle(env.DB);
          const syncedAt = body.syncedAt;

          if (body.watchLater) {
            yield* Effect.tryPromise(() => db.delete(watchLaterVideos).run());
            if (body.watchLater.length > 0) {
              yield* Effect.tryPromise(() =>
                db
                  .insert(watchLaterVideos)
                  .values(
                    body.watchLater!.map((v: any) => ({
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
                  .run(),
              );
            }
          }

          if (body.notifications) {
            for (const n of body.notifications) {
              yield* Effect.tryPromise(() =>
                db
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
                  .run(),
              );
            }
          }

          return { ok: true, syncedAt };
        }),
      isRaw: false,
      uninterruptible: false,
    });
    return handlers;
  });
}
