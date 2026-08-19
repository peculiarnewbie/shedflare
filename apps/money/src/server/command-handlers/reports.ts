import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createCustomReport } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandInvocation } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type ReportCommand = "create_report" | "update_report" | "delete_report";

type ReportInvocation = Extract<CommandInvocation, { commandType: ReportCommand }>;
export async function handleReportCommands(
  command: ReportInvocation,
  db: Db,
): Promise<CommandResult> {
  switch (command.commandType) {
    case "create_report": {
      const pp = command.payload;
      const r = createCustomReport(pp.report);
      await db.insert(s.customReports).values(r).run();
      return { ok: true, data: { id: r.id } };
    }
    case "update_report": {
      const pp = command.payload;
      const set: Partial<typeof s.customReports.$inferInsert> = { updatedAt: nowIso() };
      const f = pp.fields;
      if (f.name !== undefined) set.name = f.name;
      if (f.startDate !== undefined) set.startDate = f.startDate;
      if (f.endDate !== undefined) set.endDate = f.endDate;
      if (f.conditions !== undefined) set.conditions = f.conditions;
      if (f.graphType !== undefined) set.graphType = f.graphType;
      await db.update(s.customReports).set(set).where(eq(s.customReports.id, pp.id)).run();
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_report": {
      const pp = command.payload;
      await db.delete(s.customReports).where(eq(s.customReports.id, pp.id)).run();
      return { ok: true, data: { id: pp.id } };
    }
    default:
      return { ok: false, error: "Unknown report command" };
  }
}
