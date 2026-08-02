import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import { DashboardWidgetsResponseSchema, DashboardExportSchema } from "../../domain/schemas";
import * as s from "../../db/schema";

type Env = { MONEY_DB: D1Database };

export function createDashboardGroup(env: Env) {
  return HttpApiBuilder.group(moneyApi, "dashboard", (handlers) =>
    handlers
      .handleRaw(
        "widgets",
        wrapHandler(async (): Promise<Response> => {
          const db = createDb(env.MONEY_DB);
          const rows = await db
            .select()
            .from(s.dashboardWidgets)
            .orderBy(s.dashboardWidgets.y, s.dashboardWidgets.x)
            .all();
          return validatedJson(DashboardWidgetsResponseSchema, { widgets: rows });
        }),
      )
      .handleRaw(
        "export",
        wrapHandler(async (): Promise<Response> => {
          const db = createDb(env.MONEY_DB);
          const rows = await db
            .select()
            .from(s.dashboardWidgets)
            .orderBy(s.dashboardWidgets.y, s.dashboardWidgets.x)
            .all();
          return validatedJson(DashboardExportSchema, {
            version: 1,
            exportedAt: new Date().toISOString(),
            widgets: rows,
          });
        }),
      ),
  );
}
