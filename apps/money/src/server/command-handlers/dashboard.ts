import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

export async function handleDashboardCommands(
  commandType: string,
  payload: CommandPayloadMap["update_dashboard"],
  db: Db,
): Promise<CommandResult> {
  if (commandType !== "update_dashboard") {
    return { ok: false, error: "Unknown dashboard command: " + String(commandType) };
  }

  const now = nowIso();
  await db.delete(s.dashboardWidgets).run();
  for (const w of payload.widgets) {
    await db
      .insert(s.dashboardWidgets)
      .values({
        id: w.id,
        type: w.type,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
        meta: w.meta ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  return { ok: true, data: { count: payload.widgets.length } };
}
