/**
 * Report & dashboard command handlers — create, update, delete reports, update dashboard.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createCustomReport, createDashboardWidget } from "../../domain/factories";

export function handleReportCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_report") {
    case "create_report": {
      const row = createCustomReport({
        name: payload.report?.name,
        startDate: payload.report?.startDate,
        endDate: payload.report?.endDate,
        metadata: payload.report?.metadata,
        conditions: payload.report?.conditions,
        graphType: payload.report?.graphType,
        mode: payload.report?.mode,
        groupBy: payload.report?.groupBy,
        interval: payload.report?.interval,
      });
      events.push(eventStore.insertEvent(opId, "report_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_report": {
      const existing = access.queryOne<Record<string, unknown>>(
        `SELECT * FROM custom_reports WHERE id = ?`,
        payload.id,
      );
      if (existing) {
        const fields = payload.fields ?? {};
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
          payload.id,
        );
        const updated = access.queryOne<Record<string, unknown>>(
          `SELECT * FROM custom_reports WHERE id = ?`,
          payload.id,
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
      const widgets = (payload.widgets ?? []).map((w: any, i: number) =>
        createDashboardWidget({
          type: w.type,
          x: w.x ?? (i % 2) * 4,
          y: w.y ?? Math.floor(i / 2) * 2,
          width: w.width ?? 6,
          height: w.height ?? 2,
          meta: w.meta ?? null,
        }),
      );
      events.push(
        eventStore.insertEvent(opId, "dashboard_updated", { widgets }) as SyncServerEvent,
      );
      break;
    }
  }

  return { events };
}
