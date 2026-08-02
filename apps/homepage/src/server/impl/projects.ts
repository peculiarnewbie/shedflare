import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { projects, type ProjectRow as DbProjectRow } from "../../db/schema";
import {
  homepageApi,
  type ApiError,
  type ProjectCreatePayload,
  type ProjectRow,
  type ProjectUpdatePayload,
} from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

function toProjectRow(row: DbProjectRow): ProjectRow {
  return { ...row, createdAt: row.createdAt ?? "" };
}

export function createProjectsGroup(env: { DB: D1Database }, auth: HttpApiAuth, isPublic: boolean) {
  const list = async (): Promise<ProjectRow[]> => {
    const db = drizzle(env.DB);
    const rows = await db.select().from(projects).orderBy(asc(projects.sortOrder)).all();
    return rows.map(toProjectRow);
  };

  return HttpApiBuilder.group(homepageApi, "projects", (handlers) =>
    handlers.handle(
      "list",
      isPublic
        ? () => Effect.promise(() => list())
        : auth.createProtectedHandler<never, never, ProjectRow[]>(async () => list()),
    ),
  );
}

export function createAdminProjectsGroup(env: { DB: D1Database }, auth: HttpApiAuth) {
  return HttpApiBuilder.group(homepageApi, "admin-projects", (handlers) =>
    handlers
      .handle(
        "create",
        auth.createProtectedHandler<never, ProjectCreatePayload, ProjectRow | ApiError>(
          async (_webReq, _session, ctx) => {
            const body = ctx.payload;
            const id = body?.id ?? "";
            const title = body?.title ?? "";
            if (!id || !title) {
              return { error: "id and title are required" };
            }
            const db = drizzle(env.DB);
            const existing = await db.select().from(projects).where(eq(projects.id, id)).get();
            if (existing) return { error: `Project "${id}" already exists` };
            const now = new Date().toISOString();
            const row = {
              id,
              title,
              tags: body?.tags ?? "[]",
              image: body?.image ?? "",
              url: body?.url ?? "",
              githubUrl: body?.githubUrl ?? "",
              desc: body?.desc ?? "",
              sortOrder: body?.sortOrder ?? 0,
              showOnHome: body?.showOnHome ?? true,
              createdAt: now,
            };
            await db.insert(projects).values(row).run();
            return row;
          },
        ),
      )
      .handle(
        "update",
        auth.createProtectedHandler<{ id: string }, ProjectUpdatePayload, ProjectRow | ApiError>(
          async (_webReq, _session, ctx) => {
            const id = ctx.params?.id ?? "";
            const body = ctx.payload;
            if (!body || Object.keys(body).length === 0) {
              return { error: "No fields to update" };
            }
            const db = drizzle(env.DB);
            const existing = await db.select().from(projects).where(eq(projects.id, id)).get();
            if (!existing) return { error: "Not found" };
            await db.update(projects).set(body).where(eq(projects.id, id)).run();
            const updated = await db.select().from(projects).where(eq(projects.id, id)).get();
            return toProjectRow(updated ?? existing);
          },
        ),
      )
      .handle(
        "remove",
        auth.createProtectedHandler<{ id: string }, never, { ok: boolean }>(
          async (_webReq, _session, ctx) => {
            const id = ctx.params?.id ?? "";
            const db = drizzle(env.DB);
            await db.delete(projects).where(eq(projects.id, id)).run();
            return { ok: true };
          },
        ),
      ),
  );
}
