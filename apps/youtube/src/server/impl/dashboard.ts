import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { notifications, watchLaterVideos } from "../../db/schema";
import { youtubeApi } from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

export function createDashboardGroup(env: { DB: D1Database }, auth: HttpApiAuth) {
  const endpoint = (youtubeApi as any).groups["dashboard"].endpoints["dashboard"];
  return (HttpApiBuilder.group as any)(youtubeApi, "dashboard", (handlers: any) => {
    handlers.handlers.set("dashboard", {
      endpoint,
      handler: auth.createProtectedHandler(async () => {
        const db = drizzle(env.DB);
        const [wlRow] = await db
          .select({ value: sql<number>`count(*)` })
          .from(watchLaterVideos)
          .where(eq(watchLaterVideos.pruned, false))
          .all();
        const [unreadRow] = await db
          .select({ value: sql<number>`count(*)` })
          .from(notifications)
          .where(eq(notifications.read, false))
          .all();
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
        return {
          watchLaterCount: wlRow?.value ?? 0,
          unreadNotifCount: unreadRow?.value ?? 0,
          totalNotifs: totalRow?.value ?? 0,
          recentWatchLater: recentWl,
          recentNotifications: recentNotifs,
        };
      }),
      isRaw: false,
      uninterruptible: false,
    });
    return handlers;
  });
}
