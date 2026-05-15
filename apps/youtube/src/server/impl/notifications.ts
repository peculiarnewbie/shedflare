import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { notifications } from "../../db/schema";
import { youtubeApi } from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

export function createNotificationsGroup(env: { DB: D1Database }, auth: HttpApiAuth) {
  const endpoints = (youtubeApi as any).groups["notifications"].endpoints;
  return (HttpApiBuilder.group as any)(youtubeApi, "notifications", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: auth.createProtectedHandler(async (webReq: Request) => {
        const db = drizzle(env.DB);
        const url = new URL(webReq.url);
        const showUnread = url.searchParams.get("unread") === "true";
        const conditions = showUnread ? eq(notifications.read, false) : undefined;
        const rows = await db
          .select()
          .from(notifications)
          .where(conditions)
          .orderBy(desc(notifications.timestamp))
          .all();
        return { notifications: rows };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("read", {
      endpoint: endpoints["read"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        const db = drizzle(env.DB);
        const id = ctx.params?.id as string;
        await db.update(notifications).set({ read: true }).where(eq(notifications.id, id)).run();
        return { ok: true };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("readAll", {
      endpoint: endpoints["readAll"],
      handler: auth.createProtectedHandler(async () => {
        const db = drizzle(env.DB);
        await db.update(notifications).set({ read: true }).run();
        return { ok: true };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    return handlers;
  });
}
