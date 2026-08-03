import * as dbSchema from "#/db/schema";
import type { ProjectionContext, ProjectionInput } from "./projection-types";

export function projectTrace(input: ProjectionInput, context: ProjectionContext): void {
  const { eventType, payload } = input;
  switch (eventType) {
    case "trace_run_upserted": {
      const row = payload.row;
      context.sql.database.runSync(
        context.sql.db
          .insert(dbSchema.traceRuns)
          .values(row)
          .onConflictDoUpdate({
            target: dbSchema.traceRuns.id,
            set: {
              messageId: row.messageId,
              threadId: row.threadId,
              workspaceId: row.workspaceId,
              traceId: row.traceId,
              rootSpanId: row.rootSpanId,
              modelId: row.modelId,
              status: row.status,
              startedAt: row.startedAt,
              endedAt: row.endedAt,
              durationMs: row.durationMs,
              errorCode: row.errorCode,
              errorMessage: row.errorMessage,
              attrsJson: row.attrsJson,
            },
          }),
      );
      break;
    }
    case "trace_span_upserted": {
      const row = payload.row;
      context.sql.database.runSync(
        context.sql.db
          .insert(dbSchema.traceSpans)
          .values(row)
          .onConflictDoUpdate({
            target: dbSchema.traceSpans.id,
            set: {
              traceRunId: row.traceRunId,
              traceId: row.traceId,
              parentSpanId: row.parentSpanId,
              messageId: row.messageId,
              name: row.name,
              kind: row.kind,
              status: row.status,
              startedAt: row.startedAt,
              endedAt: row.endedAt,
              durationMs: row.durationMs,
              errorCode: row.errorCode,
              errorMessage: row.errorMessage,
              attrsJson: row.attrsJson,
              eventsJson: row.eventsJson,
            },
          }),
      );
      break;
    }
    case "comparison_group_upserted": {
      const row = payload.row;
      context.sql.database.runSync(
        context.sql.db
          .insert(dbSchema.comparisonGroups)
          .values(row)
          .onConflictDoUpdate({
            target: dbSchema.comparisonGroups.id,
            set: {
              workspaceId: row.workspaceId,
              threadIds: row.threadIds,
              createdAt: row.createdAt,
              optimistic: row.optimistic ?? null,
              opId: row.opId ?? null,
            },
          }),
      );
      break;
    }
  }
}
