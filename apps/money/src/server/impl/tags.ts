import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi, tagsGroup as group } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import { TagsResponseSchema } from "../../domain/schemas";
import * as s from "../../db/schema";

type Env = { MONEY_DB: D1Database };

export function createTagsGroup(env: Env) {
  const endpoints = group.endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "tags", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db.select().from(s.tags).orderBy(s.tags.name).all();
        return validatedJson(TagsResponseSchema, { tags: rows });
      }),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
