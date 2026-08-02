import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { experiences, type ExperienceRow as DbExperienceRow } from "../../db/schema";
import {
  homepageApi,
  type ApiError,
  type ExperienceCreatePayload,
  type ExperienceRow,
  type ExperienceUpdatePayload,
} from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

function toExperienceRow(row: DbExperienceRow): ExperienceRow {
  return { ...row, createdAt: row.createdAt ?? "" };
}

export function createExperiencesGroup(
  env: { DB: D1Database },
  auth: HttpApiAuth,
  isPublic: boolean,
) {
  const list = async (): Promise<ExperienceRow[]> => {
    const db = drizzle(env.DB);
    const rows = await db.select().from(experiences).orderBy(asc(experiences.sortOrder)).all();
    return rows.map(toExperienceRow);
  };

  return HttpApiBuilder.group(homepageApi, "experiences", (handlers) =>
    handlers.handle(
      "list",
      isPublic
        ? () => Effect.promise(() => list())
        : auth.createProtectedHandler<never, never, ExperienceRow[]>(async () => list()),
    ),
  );
}

export function createAdminExperiencesGroup(env: { DB: D1Database }, auth: HttpApiAuth) {
  return HttpApiBuilder.group(homepageApi, "admin-experiences", (handlers) =>
    handlers
      .handle(
        "create",
        auth.createProtectedHandler<never, ExperienceCreatePayload, ExperienceRow | ApiError>(
          async (_webReq, _session, ctx) => {
            const body = ctx.payload;
            const id = body?.id ?? "";
            const title = body?.title ?? "";
            if (!id || !title) {
              return { error: "id and title are required" };
            }
            const existing = await drizzle(env.DB)
              .select()
              .from(experiences)
              .where(eq(experiences.id, id))
              .get();
            if (existing) return { error: `Experience "${id}" already exists` };
            const db = drizzle(env.DB);
            const now = new Date().toISOString();
            const row = {
              id,
              title,
              workplace: body?.workplace ?? "",
              url: body?.url ?? "",
              tags: body?.tags ?? "[]",
              startDate: body?.startDate ?? "",
              endDate: body?.endDate ?? null,
              body: body?.body ?? "",
              sortOrder: body?.sortOrder ?? 0,
              showOnHome: body?.showOnHome ?? true,
              createdAt: now,
            };
            await db.insert(experiences).values(row).run();
            return row;
          },
        ),
      )
      .handle(
        "update",
        auth.createProtectedHandler<
          { id: string },
          ExperienceUpdatePayload,
          ExperienceRow | ApiError
        >(async (_webReq, _session, ctx) => {
          const id = ctx.params?.id ?? "";
          const body = ctx.payload;
          if (!body || Object.keys(body).length === 0) {
            return { error: "No fields to update" };
          }
          const db = drizzle(env.DB);
          const existing = await db.select().from(experiences).where(eq(experiences.id, id)).get();
          if (!existing) return { error: "Not found" };
          await db.update(experiences).set(body).where(eq(experiences.id, id)).run();
          const updated = await db.select().from(experiences).where(eq(experiences.id, id)).get();
          return toExperienceRow(updated ?? existing);
        }),
      )
      .handle(
        "remove",
        auth.createProtectedHandler<{ id: string }, never, { ok: boolean }>(
          async (_webReq, _session, ctx) => {
            const id = ctx.params?.id ?? "";
            const db = drizzle(env.DB);
            await db.delete(experiences).where(eq(experiences.id, id)).run();
            return { ok: true };
          },
        ),
      ),
  );
}
