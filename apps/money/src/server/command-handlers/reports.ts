import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createCustomReport } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

type ReportCommand = "create_report" | "update_report" | "delete_report";

export async function handleReportCommands(
  c: ReportCommand,
  p: CommandPayloadMap[ReportCommand],
  db: Db,
): Promise<CR> {
  switch (c) {
    case "create_report": {
      const pp = p as CommandPayloadMap["create_report"];
      const r = createCustomReport(pp.report);
      await db.insert(s.customReports).values(r);
      return { ok: true, data: { id: r.id } };
    }
    case "update_report": {
      const pp = p as CommandPayloadMap["update_report"];
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      const f = pp.fields;
      if (f.name !== undefined) set.name = f.name;
      if (f.startDate !== undefined) set.startDate = f.startDate;
      if (f.endDate !== undefined) set.endDate = f.endDate;
      if (f.conditions !== undefined) set.conditions = f.conditions;
      if (f.graphType !== undefined) set.graphType = f.graphType;
      await db.update(s.customReports).set(set).where(eq(s.customReports.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_report": {
      const pp = p as CommandPayloadMap["delete_report"];
      await db.delete(s.customReports).where(eq(s.customReports.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    default:
      return { ok: false, error: `Unknown report command: ${c}` };
  }
}
