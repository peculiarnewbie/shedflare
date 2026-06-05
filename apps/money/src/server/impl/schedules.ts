import { eq, sql } from "drizzle-orm";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi, schedulesGroup as group } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import {
  SchedulesResponseSchema,
  ScheduleResponseSchema,
  SchedulesDiscoverResponseSchema,
} from "../../domain/schemas";
import * as s from "../../db/schema";
import { discoverSchedules } from "../discover-schedules";

type Env = { MONEY_DB: D1Database };

export function createSchedulesGroup(env: Env) {
  const endpoints = group.endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "schedules", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db.select().from(s.schedules).orderBy(s.schedules.name).all();
        return validatedJson(SchedulesResponseSchema, { schedules: rows });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("get", {
      endpoint: endpoints["get"],
      handler: wrapHandler(async (req: Request): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const id = new URL(req.url).pathname.match(/\/api\/schedules\/([^/]+)$/)?.[1];
        if (!id)
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        const rows = await db
          .select({
            id: s.schedules.id,
            name: s.schedules.name,
            accountId: s.schedules.accountId,
            payeeId: s.schedules.payeeId,
            categoryId: s.schedules.categoryId,
            amount: s.schedules.amount,
            startDate: s.schedules.startDate,
            recurrenceRules: s.schedules.recurrenceRules,
            active: s.schedules.active,
            completed: s.schedules.completed,
            postsTransaction: s.schedules.postsTransaction,
            customUpcomingLength: s.schedules.customUpcomingLength,
            nextDate: s.schedules.nextDate,
            createdAt: s.schedules.createdAt,
            updatedAt: s.schedules.updatedAt,
            account_name: s.accounts.name,
            payee_name: s.payees.name,
            category_name: s.categories.name,
            group_name: s.categoryGroups.name,
          })
          .from(s.schedules)
          .leftJoin(s.accounts, eq(s.schedules.accountId, s.accounts.id))
          .leftJoin(s.payees, eq(s.schedules.payeeId, s.payees.id))
          .leftJoin(s.categories, eq(s.schedules.categoryId, s.categories.id))
          .leftJoin(s.categoryGroups, eq(s.categories.groupId, s.categoryGroups.id))
          .where(eq(s.schedules.id, id))
          .all();
        if (!rows[0])
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        return validatedJson(ScheduleResponseSchema, { schedule: rows[0] });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("discover", {
      endpoint: endpoints["discover"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const discovered = await discoverSchedules(db);
        return validatedJson(SchedulesDiscoverResponseSchema, { discovered });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    return handlers;
  });
}
