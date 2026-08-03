import type { SyncEventPayloadMap, SyncEventType } from "#/domain";
import type { ChatRepository } from "./chat-repository";
import type { DataAccess } from "./data-access";

export type ProjectionInput = {
  [EventType in SyncEventType]: {
    eventType: EventType;
    payload: SyncEventPayloadMap[EventType];
  };
}[SyncEventType];

export type ProjectionContext = {
  sql: DataAccess;
  repository: ChatRepository;
  project: (input: ProjectionInput) => void;
};
