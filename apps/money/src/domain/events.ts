import type {
  Account,
  Transaction,
  Category,
  CategoryGroup,
  Payee,
  Schedule,
  Rule,
  Tag,
  CustomReport,
  DashboardWidget,
  Setting,
} from "../db/schema";

// ---------------------------------------------------------------------------
// Event payloads (server → client WebSocket events)
// Each event carries a row for TanStack DB upsert/delete, plus computed values.
// ---------------------------------------------------------------------------

export interface SyncEventPayloadMap {
  // Row-level events
  account_created: { row: Account };
  account_updated: { row: Account };
  account_closed: { id: string; closedAt: string };
  account_deleted: { id: string };
  transaction_created: { row: Transaction };
  transaction_updated: { row: Transaction };
  transaction_deleted: { id: string };
  transactions_imported: { accountId: string; added: number; updated: number; errors: string[] };

  category_created: { row: Category };
  category_updated: { row: Category };
  category_group_created: { row: CategoryGroup };
  category_group_updated: { row: CategoryGroup };

  payee_created: { row: Payee };
  payee_updated: { row: Payee };
  payees_merged: { targetId: string; sourceIds: string[] };

  schedule_created: { row: Schedule };
  schedule_updated: { row: Schedule };
  schedule_deleted: { id: string };

  rule_created: { row: Rule };
  rule_updated: { row: Rule };

  tag_created: { row: Tag };
  tag_deleted: { id: string };
  transaction_tag_added: { transactionId: string; tagId: string; tagName: string };
  transaction_tag_removed: { transactionId: string; tagId: string };

  report_created: { row: CustomReport };
  report_updated: { row: CustomReport };
  dashboard_updated: { widgets: DashboardWidget[] };

  exchange_rate_updated: { usdToIdr: number; updatedAt: string };
  settings_updated: { row: Setting };

  // Computed value events (triggered by budget engine)
  budget_recalculated: { month: number; toBudget: number; buffered: number };
  category_leftover_changed: {
    month: number;
    categoryId: string;
    leftover: number;
    leftoverPos: number;
    budgeted: number;
    spent: number;
  };
  category_budget_set: { month: number; categoryId: string; amount: number; carryover: boolean };

  // Sync lifecycle events
  server_state_rebased: { snapshot: import("./types").SyncSnapshot };
}

export type SyncEventType = keyof SyncEventPayloadMap;

export const SYNC_EVENT_TYPES: readonly SyncEventType[] = [
  "account_created",
  "account_updated",
  "account_closed",
  "account_deleted",
  "transaction_created",
  "transaction_updated",
  "transaction_deleted",
  "transactions_imported",
  "category_created",
  "category_updated",
  "category_group_created",
  "category_group_updated",
  "payee_created",
  "payee_updated",
  "payees_merged",
  "schedule_created",
  "schedule_updated",
  "schedule_deleted",
  "rule_created",
  "rule_updated",
  "tag_created",
  "tag_deleted",
  "transaction_tag_added",
  "transaction_tag_removed",
  "report_created",
  "report_updated",
  "dashboard_updated",
  "exchange_rate_updated",
  "settings_updated",
  "budget_recalculated",
  "category_leftover_changed",
  "category_budget_set",
  "server_state_rebased",
] as const;

export function isSyncEventType(value: unknown): value is SyncEventType {
  return typeof value === "string" && SYNC_EVENT_TYPES.includes(value as SyncEventType);
}

// ---------------------------------------------------------------------------
// Server → Client envelope types
// ---------------------------------------------------------------------------
export interface SyncServerHelloAck {
  type: "hello_ack";
  protocolVersion: string;
  serverTime: string;
  lastServerSeq: number;
}

export interface SyncServerAck {
  type: "ack";
  opId: string;
  serverSeq: number;
  acceptedAt: string;
  commandType: string;
}

export interface SyncServerReject {
  type: "reject";
  opId: string;
  reason: string;
  code: string;
  retriable: boolean;
}

export interface SyncServerEvent<T extends SyncEventType = SyncEventType> {
  type: "event";
  serverSeq: number;
  eventId: string;
  eventType: T;
  payload: SyncEventPayloadMap[T];
  causedByOpId?: string | null;
}

export interface SyncServerReset {
  type: "sync_reset";
  reason: string;
  protocolVersion?: string;
  snapshot: import("./types").SyncSnapshot;
}

export interface SyncServerPong {
  type: "pong";
  at: string;
}

export type SyncServerEnvelope =
  | SyncServerHelloAck
  | SyncServerAck
  | SyncServerReject
  | SyncServerEvent
  | SyncServerReset
  | SyncServerPong;

// ---------------------------------------------------------------------------
// Client → Server envelope types
// ---------------------------------------------------------------------------
export interface SyncClientHello {
  type: "hello";
  clientId: string;
  protocolVersion: string;
  lastServerSeq: number;
  unackedOpIds: string[];
}

export interface SyncClientCommand {
  type: "command";
  opId: string;
  clientTs: string;
  commandType: string;
  payload: unknown;
}

export interface SyncClientPing {
  type: "ping";
}

export type SyncClientEnvelope = SyncClientHello | SyncClientCommand | SyncClientPing;

// ---------------------------------------------------------------------------
// Pending sync op (persisted to localStorage)
// ---------------------------------------------------------------------------
export interface PendingSyncOp {
  opId: string;
  clientTs: string;
  commandType: string;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// Decoder helpers
// ---------------------------------------------------------------------------
import type { SyncTables, SyncSnapshot } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordOfRecords(value: unknown): SyncTables | null {
  if (!isRecord(value)) return null;
  const tables: Record<string, Record<string, unknown>> = {};
  for (const [tableName, rows] of Object.entries(value)) {
    if (!isRecord(rows)) return null;
    tables[tableName] = rows as Record<string, unknown>;
  }
  return tables as SyncTables;
}

export function decodeSyncSnapshot(value: unknown): SyncSnapshot | null {
  if (!isRecord(value)) return null;
  const tables = asRecordOfRecords(value.tables);
  if (!tables) return null;
  if (value.serverSeq !== undefined && typeof value.serverSeq !== "number") return null;
  return { tables, serverSeq: value.serverSeq as number | undefined };
}

export function decodeSyncTables(value: unknown): SyncTables | null {
  return asRecordOfRecords(value);
}

export function decodeSyncServerEnvelope(value: unknown): SyncServerEnvelope | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "hello_ack":
      if (
        typeof value.protocolVersion !== "string" ||
        typeof value.serverTime !== "string" ||
        typeof value.lastServerSeq !== "number"
      )
        return null;
      return value as unknown as SyncServerHelloAck;
    case "ack":
      if (
        typeof value.opId !== "string" ||
        typeof value.serverSeq !== "number" ||
        typeof value.acceptedAt !== "string" ||
        typeof value.commandType !== "string"
      )
        return null;
      return value as unknown as SyncServerAck;
    case "reject":
      if (
        typeof value.opId !== "string" ||
        typeof value.reason !== "string" ||
        typeof value.code !== "string" ||
        typeof value.retriable !== "boolean"
      )
        return null;
      return value as unknown as SyncServerReject;
    case "event":
      if (
        typeof value.serverSeq !== "number" ||
        typeof value.eventId !== "string" ||
        typeof value.eventType !== "string" ||
        !isRecord(value.payload)
      )
        return null;
      return value as unknown as SyncServerEvent;
    case "sync_reset": {
      if (typeof value.reason !== "string") return null;
      if (value.protocolVersion !== undefined && typeof value.protocolVersion !== "string")
        return null;
      const snapshot = decodeSyncSnapshot(value.snapshot);
      if (!snapshot) return null;
      return {
        type: "sync_reset",
        reason: value.reason,
        protocolVersion: value.protocolVersion,
        snapshot,
      };
    }
    case "pong":
      if (typeof value.at !== "string") return null;
      return value as unknown as SyncServerPong;
    default:
      return null;
  }
}
