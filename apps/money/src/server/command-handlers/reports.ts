import type { DataAccess } from "../data-access";
import { createCustomReport } from "../../domain/factories";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export function handleReportCommands(c: string, p: any, a: DataAccess): CR {
  switch (c) {
    case "create_report": {
      const r = createCustomReport(p.report);
      a.exec(
        `INSERT INTO custom_reports (id, name, start_date, end_date, conditions, graph_type, mode, group_by, sort_by, interval, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'desc', ?, ?, ?)`,
        r.id,
        r.name,
        r.startDate,
        r.endDate,
        r.conditions,
        r.graphType,
        r.mode,
        r.groupBy,
        r.interval,
        r.createdAt,
        r.updatedAt,
      );
      return { ok: true, data: { id: r.id } };
    }
    case "update_report": {
      const now = new Date().toISOString();
      const fs: string[] = ["updated_at = ?"],
        ps: unknown[] = [now];
      const f = p.fields;
      if (f.name !== undefined) {
        fs.push("name = ?");
        ps.push(f.name);
      }
      if (f.startDate !== undefined) {
        fs.push("start_date = ?");
        ps.push(f.startDate);
      }
      if (f.endDate !== undefined) {
        fs.push("end_date = ?");
        ps.push(f.endDate);
      }
      if (f.conditions !== undefined) {
        fs.push("conditions = ?");
        ps.push(f.conditions);
      }
      if (f.graphType !== undefined) {
        fs.push("graph_type = ?");
        ps.push(f.graphType);
      }
      ps.push(p.id);
      a.exec(`UPDATE custom_reports SET ${fs.join(", ")} WHERE id = ?`, ...ps);
      return { ok: true, data: { id: p.id } };
    }
    case "delete_report": {
      a.exec("DELETE FROM custom_reports WHERE id = ?", p.id);
      return { ok: true, data: { id: p.id } };
    }
    default:
      return { ok: false, error: `Unknown report command: ${c}` };
  }
}
