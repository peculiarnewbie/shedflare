import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { experiences } from "../../db/schema";
import { homepageApi } from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function createExperiencesGroup(
  env: { DB: D1Database },
  auth: HttpApiAuth,
  isPublic: boolean,
) {
  const endpoints = (homepageApi as any).groups["experiences"].endpoints;
  return (HttpApiBuilder.group as any)(homepageApi, "experiences", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: isPublic
        ? async () => {
            const db = drizzle(env.DB);
            return await db.select().from(experiences).orderBy(asc(experiences.sortOrder)).all();
          }
        : auth.createProtectedHandler(async () => {
            const db = drizzle(env.DB);
            return await db.select().from(experiences).orderBy(asc(experiences.sortOrder)).all();
          }),
      isRaw: false,
      uninterruptible: false,
    });
    return handlers;
  });
}

export function createAdminExperiencesGroup(env: { DB: D1Database }, auth: HttpApiAuth) {
  const endpoints = (homepageApi as any).groups["admin-experiences"].endpoints;
  return (HttpApiBuilder.group as any)(homepageApi, "admin-experiences", (handlers: any) => {
    handlers.handlers.set("create", {
      endpoint: endpoints["create"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        const body = ctx.payload as Record<string, unknown> | null;
        const id = asString(body?.id, "");
        const title = asString(body?.title, "");
        if (!id || !title) {
          return { error: "id and title are required" } as any;
        }
        const existing = await drizzle(env.DB)
          .select()
          .from(experiences)
          .where(eq(experiences.id, id))
          .get();
        if (existing) return { error: `Experience "${id}" already exists` } as any;
        const db = drizzle(env.DB);
        const now = new Date().toISOString();
        const row = {
          id,
          title,
          workplace: asString(body?.workplace, ""),
          url: asString(body?.url, ""),
          tags: asString(body?.tags, "[]"),
          startDate: asString(body?.startDate, ""),
          endDate: body?.endDate ? asString(body.endDate, "") : null,
          body: asString(body?.body, ""),
          sortOrder: asNumber(body?.sortOrder, 0),
          showOnHome: asBoolean(body?.showOnHome, true),
          createdAt: now,
        };
        await db.insert(experiences).values(row).run();
        return row as any;
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("update", {
      endpoint: endpoints["update"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        const id = asString(ctx.params?.id, "");
        const body = ctx.payload as Record<string, unknown> | null;
        if (!body || Object.keys(body).length === 0) {
          return { error: "No fields to update" } as any;
        }
        const db = drizzle(env.DB);
        const existing = await db.select().from(experiences).where(eq(experiences.id, id)).get();
        if (!existing) return { error: "Not found" } as any;
        const update: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(body)) {
          if (key === "endDate") {
            update.endDate = value
              ? typeof value === "string"
                ? value
                : JSON.stringify(value)
              : null;
          } else if (key === "showOnHome" || key === "sortOrder") {
            update[key] = value;
          } else {
            update[key] = typeof value === "string" ? value : JSON.stringify(value);
          }
        }
        await db
          .update(experiences)
          .set(update as any)
          .where(eq(experiences.id, id))
          .run();
        const updated = await db.select().from(experiences).where(eq(experiences.id, id)).get();
        return (updated ?? existing) as any;
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("remove", {
      endpoint: endpoints["remove"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        const id = asString(ctx.params?.id, "");
        const db = drizzle(env.DB);
        await db.delete(experiences).where(eq(experiences.id, id)).run();
        return { ok: true };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    return handlers;
  });
}
