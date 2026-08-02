import { ChatRepository } from "./chat-repository";
import type { DataAccess } from "./data-access";
import { projectConversation } from "./conversation-projector";
import { projectSearch } from "./search-projector";
import { projectSettings } from "./settings-projector";
import { replaceSnapshot } from "./snapshot-projector";
import { projectTrace } from "./trace-projector";
import type { ProjectionContext, ProjectionInput } from "./projection-types";

export type { ProjectionInput } from "./projection-types";

type EventProjectorInput = {
  sql: DataAccess;
  repository: ChatRepository;
};

export class EventProjector {
  private readonly context: ProjectionContext;

  constructor({ sql, repository }: EventProjectorInput) {
    this.context = {
      sql,
      repository,
      project: (input) => this.apply(input),
    };
  }

  apply(input: ProjectionInput): void {
    const { eventType } = input;
    switch (eventType) {
      case "account_settings_upserted":
      case "workspace_upserted":
      case "workspace_archived":
        projectSettings(input, this.context);
        break;
      case "thread_upserted":
      case "thread_archived":
      case "thread_deleted":
      case "message_upserted":
      case "message_delta":
      case "message_completed":
      case "message_failed":
      case "message_part_appended":
      case "attachment_upserted":
      case "attachment_deleted":
        projectConversation(input, this.context);
        break;
      case "search_runs_replaced":
      case "search_results_replaced":
      case "extract_runs_replaced":
        projectSearch(input, this.context);
        break;
      case "trace_run_upserted":
      case "trace_span_upserted":
      case "comparison_group_upserted":
        projectTrace(input, this.context);
        break;
      case "server_state_rebased":
        replaceSnapshot(input.payload.snapshot, this.context);
        break;
      default: {
        const _exhaustive: never = eventType;
        console.warn("[event-store] unhandled event type", _exhaustive);
      }
    }
  }
}
