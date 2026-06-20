import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { projects } from "../../db/schema";
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

export function createProjectsGroup(env: { DB: D1Database }, auth: HttpApiAuth, isPublic: boolean) {
  const endpoints = (homepageApi as any).groups["projects"].endpoints;
  return (HttpApiBuilder.group as any)(homepageApi, "projects", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: isPublic
        ? async () => {
            const db = drizzle(env.DB);
            return await db.select().from(projects).orderBy(asc(projects.sortOrder)).all();
          }
        : auth.createProtectedHandler(async () => {
            const db = drizzle(env.DB);
            return await db.select().from(projects).orderBy(asc(projects.sortOrder)).all();
          }),
      isRaw: false,
      uninterruptible: false,
    });
    return handlers;
  });
}

export function createAdminProjectsGroup(env: { DB: D1Database }, auth: HttpApiAuth) {
  const endpoints = (homepageApi as any).groups["admin-projects"].endpoints;
  return (HttpApiBuilder.group as any)(homepageApi, "admin-projects", (handlers: any) => {
    handlers.handlers.set("create", {
      endpoint: endpoints["create"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        const body = ctx.payload as Record<string, unknown> | null;
        const id = asString(body?.id, "");
        const title = asString(body?.title, "");
        if (!id || !title) {
          return { error: "id and title are required" } as any;
        }
        const db = drizzle(env.DB);
        const existing = await db.select().from(projects).where(eq(projects.id, id)).get();
        if (existing) return { error: `Project "${id}" already exists` } as any;
        const now = new Date().toISOString();
        const row = {
          id,
          title,
          tags: asString(body?.tags, "[]"),
          image: asString(body?.image, ""),
          url: asString(body?.url, ""),
          githubUrl: asString(body?.githubUrl, ""),
          desc: asString(body?.desc, ""),
          sortOrder: asNumber(body?.sortOrder, 0),
          showOnHome: asBoolean(body?.showOnHome, true),
          createdAt: now,
        };
        await db.insert(projects).values(row).run();
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
        const existing = await db.select().from(projects).where(eq(projects.id, id)).get();
        if (!existing) return { error: "Not found" } as any;
        await db
          .update(projects)
          .set(body as any)
          .where(eq(projects.id, id))
          .run();
        const updated = await db.select().from(projects).where(eq(projects.id, id)).get();
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
        await db.delete(projects).where(eq(projects.id, id)).run();
        return { ok: true };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    return handlers;
  });
}
