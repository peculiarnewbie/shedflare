import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import { TagsResponseSchema } from "../../domain/schemas";
import * as s from "../../db/schema";

type Env = { MONEY_DB: D1Database };

export function createTagsGroup(env: Env) {
  return HttpApiBuilder.group(moneyApi, "tags", (handlers) =>
    handlers.handleRaw(
      "list",
      wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db.select().from(s.tags).orderBy(s.tags.name).all();
        return validatedJson(TagsResponseSchema, { tags: rows });
      }),
    ),
  );
}
