/**
 * Report & dashboard command handlers — create, update, delete reports, update dashboard.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createCustomReport, createDashboardWidget } from "../../domain/factories";
import { decodeCommand } from "../../domain/commands";

export function handleReportCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_report") {
    case "create_report": {
      const valid = decodeCommand("create_report", payload);
      const row = createCustomReport({
        name: valid.report?.name,
        startDate: valid.report?.startDate,
        endDate: valid.report?.endDate,
        metadata: valid.report?.metadata,
        conditions: valid.report?.conditions,
        graphType: valid.report?.graphType,
        mode: valid.report?.mode,
        groupBy: valid.report?.groupBy,
        interval: valid.report?.interval,
      });
      events.push(eventStore.insertEvent(opId, "report_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_report": {
      const valid = decodeCommand("update_report", payload);
      const existing = access.queryOne<Record<string, unknown>>(
        `SELECT * FROM custom_reports WHERE id = ?`,
        valid.id,
      );
      if (existing) {
        const fields = valid.fields;
        const now = new Date().toISOString();
        access.exec(
          `UPDATE custom_reports SET name = ?, start_date = ?, end_date = ?, mode = ?, group_by = ?,
           graph_type = ?, conditions = ?, metadata = ?, updated_at = ? WHERE id = ?`,
          fields.name ?? existing.name,
          fields.startDate !== undefined ? fields.startDate : existing.start_date,
          fields.endDate !== undefined ? fields.endDate : existing.end_date,
          fields.mode !== undefined ? fields.mode : existing.mode,
          fields.groupBy !== undefined ? fields.groupBy : existing.group_by,
          fields.graphType !== undefined ? fields.graphType : existing.graph_type,
          fields.conditions ?? existing.conditions,
          fields.metadata !== undefined ? fields.metadata : existing.metadata,
          now,
          valid.id,
        );
        const updated = access.queryOne<Record<string, unknown>>(
          `SELECT * FROM custom_reports WHERE id = ?`,
          valid.id,
        );
        if (updated) {
          events.push(
            eventStore.insertEvent(opId, "report_updated", {
              row: updated as any,
            }) as SyncServerEvent,
          );
        }
      }
      break;
    }

    case "delete_report": {
      access.exec(`DELETE FROM custom_reports WHERE id = ?`, payload.id);
      break;
    }

    case "update_dashboard": {
      const valid = decodeCommand("update_dashboard", payload);
      const widgets = valid.widgets.map((w: any) => ({
        ...createDashboardWidget({
          type: w.type,
          x: w.x,
          y: w.y,
          width: w.width,
          height: w.height,
          meta: w.meta ?? null,
        }),
        id: w.id,
      }));
      events.push(
        eventStore.insertEvent(opId, "dashboard_updated", { widgets }) as SyncServerEvent,
      );
      break;
    }
  }

  return { events };
}
