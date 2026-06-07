import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { tags, fileTags } from "../../db/schema";
import { driveApi } from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

export function createTagsGroup(env: { DB: D1Database }, auth: HttpApiAuth) {
  return HttpApiBuilder.group(driveApi, "tags", (handlers) =>
    handlers.handle("list", (ctx) =>
      auth.createProtectedHandler(async () => {
        const db = drizzle(env.DB);
        const rows = await db
          .select({ name: tags.name, count: count(fileTags.fileId) })
          .from(tags)
          .innerJoin(fileTags, eq(fileTags.tagId, tags.id))
          .groupBy(tags.id)
          .orderBy(tags.name)
          .all();
        return { tags: rows };
      })(ctx),
    ),
  );
}
