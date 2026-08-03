import * as dbSchema from "#/db/schema";
import type { ProjectionContext, ProjectionInput } from "./projection-types";

export function projectSettings(input: ProjectionInput, context: ProjectionContext): void {
  const { eventType, payload } = input;
  switch (eventType) {
    case "account_settings_upserted": {
      const row = payload.row;
      context.sql.database.runSync(
        context.sql.db
          .insert(dbSchema.accountSettings)
          .values(row)
          .onConflictDoUpdate({
            target: dbSchema.accountSettings.id,
            set: {
              expandReasoningByDefault: row.expandReasoningByDefault,
              showTraces: row.showTraces,
              titleGenerationModelId: row.titleGenerationModelId,
              titleGenerationModelInterleavedField: row.titleGenerationModelInterleavedField,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              optimistic: row.optimistic ?? null,
              opId: row.opId ?? null,
            },
          }),
      );
      break;
    }
    case "workspace_upserted": {
      const row = payload.row;
      context.sql.database.runSync(
        context.sql.db
          .insert(dbSchema.workspaces)
          .values(row)
          .onConflictDoUpdate({
            target: dbSchema.workspaces.id,
            set: {
              name: row.name,
              slug: row.slug,
              systemPrompt: row.systemPrompt,
              defaultModelId: row.defaultModelId,
              defaultReasoningLevel: row.defaultReasoningLevel,
              defaultSearchMode: row.defaultSearchMode,
              defaultSearchLimit: row.defaultSearchLimit,
              preferFreeSearch: row.preferFreeSearch,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              archivedAt: row.archivedAt,
              sortKey: row.sortKey,
              optimistic: row.optimistic ?? null,
              opId: row.opId ?? null,
            },
          }),
      );
      break;
    }
    case "workspace_archived": {
      const row = context.repository.getWorkspace(payload.id);
      if (!row) break;
      context.project({
        eventType: "workspace_upserted",
        payload: {
          row: { ...row, archivedAt: payload.archivedAt, updatedAt: payload.updatedAt },
        },
      });
      break;
    }
  }
}
