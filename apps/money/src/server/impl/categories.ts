import { eq } from "drizzle-orm";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi, categoriesGroup as group } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import {
  CategoriesResponseSchema,
  CategoryGroupsResponseSchema,
  GoalProgressResponseSchema,
} from "../../domain/schemas";
import * as s from "../../db/schema";

type Env = { MONEY_DB: D1Database };

export function createCategoriesGroup(env: Env) {
  const endpoints = group.endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "categories", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db
          .select({
            id: s.categories.id,
            name: s.categories.name,
            isIncome: s.categories.isIncome,
            groupId: s.categories.groupId,
            sortOrder: s.categories.sortOrder,
            hidden: s.categories.hidden,
            goalDef: s.categories.goalDef,
            createdAt: s.categories.createdAt,
            updatedAt: s.categories.updatedAt,
            group_name: s.categoryGroups.name,
          })
          .from(s.categories)
          .leftJoin(s.categoryGroups, eq(s.categories.groupId, s.categoryGroups.id))
          .orderBy(s.categoryGroups.sortOrder, s.categories.sortOrder)
          .all();
        return validatedJson(CategoriesResponseSchema, { categories: rows });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("groups", {
      endpoint: endpoints["groups"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db
          .select()
          .from(s.categoryGroups)
          .orderBy(s.categoryGroups.sortOrder, s.categoryGroups.name)
          .all();
        return validatedJson(CategoryGroupsResponseSchema, { groups: rows });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("goalProgress", {
      endpoint: endpoints["goalProgress"],
      handler: wrapHandler(async (): Promise<Response> => {
        return validatedJson(GoalProgressResponseSchema, { progress: [] });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    return handlers;
  });
}
