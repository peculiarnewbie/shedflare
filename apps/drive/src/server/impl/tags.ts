import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { tags, fileTags } from "../../db/schema";
import { driveApi } from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

export function createTagsGroup(env: { DB: D1Database }, auth: HttpApiAuth) {
  const endpoint = (driveApi as any).groups["tags"].endpoints["list"];
  return (HttpApiBuilder.group as any)(driveApi, "tags", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint,
      handler: auth.createProtectedHandler(async () => {
        const db = drizzle(env.DB);
        const rows = await db
          .select({ name: tags.name, count: count(fileTags.fileId) })
          .from(tags)
          .innerJoin(fileTags, eq(fileTags.fileId, tags.id))
          .groupBy(tags.id)
          .orderBy(tags.name)
          .all();
        return { tags: rows };
      }),
      isRaw: false,
      uninterruptible: false,
    });
    return handlers;
  });
}
