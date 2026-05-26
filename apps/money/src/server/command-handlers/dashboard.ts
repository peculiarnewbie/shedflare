import type { DataAccess } from "../data-access";
import { nowIso } from "../../domain/types";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export function handleDashboardCommands(
  commandType: string,
  payload: any,
  access: DataAccess,
): CommandResult {
  switch (commandType) {
    case "update_dashboard": {
      const now = nowIso();
      access.exec("DELETE FROM dashboard_widgets");
      for (const w of payload.widgets) {
        access.exec(
          `INSERT INTO dashboard_widgets (id, type, x, y, width, height, meta, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          w.id,
          w.type,
          w.x,
          w.y,
          w.width,
          w.height,
          w.meta ?? null,
          now,
          now,
        );
      }
      return { ok: true, data: { count: payload.widgets.length } };
    }

    default:
      return { ok: false, error: `Unknown dashboard command: ${commandType}` };
  }
}
