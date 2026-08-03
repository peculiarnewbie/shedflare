import * as dbSchema from "#/db/schema";
import { eq } from "drizzle-orm";
import type { ProjectionContext, ProjectionInput } from "./projection-types";

export function projectSearch(input: ProjectionInput, context: ProjectionContext): void {
  const { eventType, payload } = input;
  switch (eventType) {
    case "search_runs_replaced": {
      context.sql.database.runSync(
        context.sql.db
          .delete(dbSchema.searchRuns)
          .where(eq(dbSchema.searchRuns.messageId, payload.messageId)),
      );
      for (const row of payload.rows) {
        context.sql.database.runSync(
          context.sql.db
            .insert(dbSchema.searchRuns)
            .values(row)
            .onConflictDoUpdate({
              target: dbSchema.searchRuns.id,
              set: {
                messageId: row.messageId,
                query: row.query,
                status: row.status,
                step: row.step,
                numResults: row.numResults,
                resultCount: row.resultCount,
                previewText: row.previewText,
                errorMessage: row.errorMessage,
                mode: row.mode ?? null,
                createdAt: row.createdAt,
              },
            }),
        );
      }
      break;
    }
    case "search_results_replaced": {
      context.sql.database.runSync(
        context.sql.db
          .delete(dbSchema.searchResults)
          .where(eq(dbSchema.searchResults.messageId, payload.messageId)),
      );
      for (const row of payload.rows) {
        context.sql.database.runSync(
          context.sql.db
            .insert(dbSchema.searchResults)
            .values(row)
            .onConflictDoUpdate({
              target: dbSchema.searchResults.id,
              set: {
                searchRunId: row.searchRunId,
                messageId: row.messageId,
                url: row.url,
                title: row.title,
                snippet: row.snippet,
                publishedAt: row.publishedAt,
                domain: row.domain,
                score: row.score,
              },
            }),
        );
      }
      break;
    }
    case "extract_runs_replaced": {
      context.sql.database.runSync(
        context.sql.db
          .delete(dbSchema.extractRuns)
          .where(eq(dbSchema.extractRuns.messageId, payload.messageId)),
      );
      for (const row of payload.rows) {
        context.sql.database.runSync(
          context.sql.db
            .insert(dbSchema.extractRuns)
            .values(row)
            .onConflictDoUpdate({
              target: dbSchema.extractRuns.id,
              set: {
                messageId: row.messageId,
                url: row.url,
                status: row.status,
                step: row.step,
                charCount: row.charCount,
                originalLength: row.originalLength,
                truncated: row.truncated,
                errorMessage: row.errorMessage,
                createdAt: row.createdAt,
              },
            }),
        );
      }
      break;
    }
  }
}
