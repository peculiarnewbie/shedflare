import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { watchLaterVideos } from "../../db/schema";
import { youtubeApi } from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

export function createWatchLaterGroup(env: { DB: D1Database }, auth: HttpApiAuth) {
  const endpoints = (youtubeApi as any).groups["watchLater"].endpoints;
  return (HttpApiBuilder.group as any)(youtubeApi, "watchLater", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: auth.createProtectedHandler(async (webReq: Request) => {
        const db = drizzle(env.DB);
        const url = new URL(webReq.url);
        const showPruned = url.searchParams.get("pruned") === "true";
        const conditions = showPruned ? undefined : eq(watchLaterVideos.pruned, false);
        const rows = await db
          .select()
          .from(watchLaterVideos)
          .where(conditions)
          .orderBy(desc(watchLaterVideos.sortOrder))
          .all();
        return { videos: rows };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("prune", {
      endpoint: endpoints["prune"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        const db = drizzle(env.DB);
        const videoId = ctx.params?.videoId as string;
        await db
          .update(watchLaterVideos)
          .set({ pruned: true })
          .where(eq(watchLaterVideos.videoId, videoId))
          .run();
        return { ok: true };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("unprune", {
      endpoint: endpoints["unprune"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        const db = drizzle(env.DB);
        const videoId = ctx.params?.videoId as string;
        await db
          .update(watchLaterVideos)
          .set({ pruned: false })
          .where(eq(watchLaterVideos.videoId, videoId))
          .run();
        return { ok: true };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    return handlers;
  });
}
