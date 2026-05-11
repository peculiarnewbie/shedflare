/**
 * Sync adapter — processes server event envelopes and applies them to TanStack DB collections.
 * Also manages snapshot hydration and offline cache.
 */
import type {
  SyncServerEnvelope,
  SyncServerEvent,
  SyncEventPayloadMap,
  SyncEventType,
} from "../domain/events";
import type { SyncTables, SyncSnapshot } from "../domain/types";
import type {
  Account,
  Transaction,
  Category,
  CategoryGroup,
  Payee,
  Schedule,
  Rule,
  Tag,
  Budget,
  BudgetMonth,
  CustomReport,
  DashboardWidget,
  ExchangeRate,
  Setting,
} from "../db/schema";
import * as conn from "./ws-connection";
import * as pendingOps from "./pending-ops";
import {
  accountsCollection,
  transactionsCollection,
  categoriesCollection,
  categoryGroupsCollection,
  budgetsCollection,
  budgetMonthsCollection,
  payeesCollection,
  schedulesCollection,
  rulesCollection,
  tagsCollection,
  transactionTagsCollection,
  customReportsCollection,
  dashboardWidgetsCollection,
  exchangeRatesCollection,
  settingsCollection,
  getSyncWriter,
  resetCollections,
  TABLE_TO_COLLECTION,
  type SyncWriter,
} from "./collections";
import { readCachedSnapshot, writeCachedSnapshot } from "./offline-cache";

// ---------------------------------------------------------------------------
// Delta coalescing — merge consecutive message_delta-like events
// ---------------------------------------------------------------------------

type EventEnvelope = Extract<SyncServerEnvelope, { type: "event" }>;

function coalesceEvents(events: EventEnvelope[]): EventEnvelope[] {
  // For our budget domain, there's no streaming delta to coalesce like chat.
  // But we still deduplicate consecutive identical events for safety.
  const merged: EventEnvelope[] = [];
  for (const event of events) {
    const last = merged.at(-1);
    if (
      last?.eventType === event.eventType &&
      JSON.stringify(last.payload) === JSON.stringify(event.payload)
    ) {
      // Same event type + same payload → skip duplicate
      last.serverSeq = event.serverSeq;
      continue;
    }
    merged.push(event);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Batched sync writes
// ---------------------------------------------------------------------------

type BatchEntry = { type: "insert" | "update"; value: object } | { type: "delete"; key: string };

let activeBatch: Map<string, BatchEntry[]> | null = null;

function beginBatch() {
  activeBatch = new Map();
}

function pushBatchOp(collectionId: string, op: BatchEntry) {
  if (!activeBatch) {
    const writer = getSyncWriter(collectionId);
    if (!writer) return;
    writer.begin({ immediate: true });
    writer.write(
      op.type === "delete" ? { key: op.key, type: "delete" } : { type: op.type, value: op.value },
    );
    writer.commit();
    return;
  }
  const list = activeBatch.get(collectionId) ?? [];
  list.push(op);
  activeBatch.set(collectionId, list);
}

function flushBatch() {
  if (!activeBatch) return;
  for (const [collectionId, ops] of activeBatch) {
    const writer = getSyncWriter(collectionId);
    if (!writer) continue;
    writer.begin();
    for (const op of ops) {
      writer.write(
        op.type === "delete" ? { key: op.key, type: "delete" } : { type: op.type, value: op.value },
      );
    }
    writer.commit();
  }
  activeBatch = null;
}

function hasRow(collectionId: string, key: string): boolean {
  const writers: Record<string, any> = {
    accounts: accountsCollection,
    transactions: transactionsCollection,
    categories: categoriesCollection,
    categoryGroups: categoryGroupsCollection,
    budgets: budgetsCollection,
    budgetMonths: budgetMonthsCollection,
    payees: payeesCollection,
    schedules: schedulesCollection,
    rules: rulesCollection,
    tags: tagsCollection,
    transactionTags: transactionTagsCollection,
    customReports: customReportsCollection,
    dashboardWidgets: dashboardWidgetsCollection,
    exchangeRates: exchangeRatesCollection,
    settings: settingsCollection,
  };
  const collection = writers[collectionId] as any;
  return Boolean(collection?.get(key));
}

function syncUpsert(collectionId: string, key: string, value: object) {
  pushBatchOp(collectionId, { type: hasRow(collectionId, key) ? "update" : "insert", value });
}

function syncDelete(collectionId: string, key: string) {
  pushBatchOp(collectionId, { type: "delete", key });
}

// ---------------------------------------------------------------------------
// Collection ID mapping (event type → collection id)
// ---------------------------------------------------------------------------

function eventTypeToCollection(eventType: string): string | null {
  switch (eventType) {
    case "account_created":
    case "account_updated":
      return "accounts";
    case "account_closed":
      return "accounts";
    case "account_deleted":
      return "accounts";
    case "transaction_created":
    case "transaction_updated":
      return "transactions";
    case "transaction_deleted":
      return "transactions";
    case "category_created":
    case "category_updated":
      return "categories";
    case "category_group_created":
    case "category_group_updated":
      return "categoryGroups";
    case "category_budget_set":
      return "budgets";
    case "payee_created":
    case "payee_updated":
      return "payees";
    case "schedule_created":
    case "schedule_updated":
      return "schedules";
    case "schedule_deleted":
      return "schedules";
    case "rule_created":
    case "rule_updated":
      return "rules";
    case "tag_created":
      return "tags";
    case "tag_deleted":
      return "tags";
    case "transaction_tag_added":
    case "transaction_tag_removed":
      return "transactionTags";
    case "report_created":
    case "report_updated":
      return "customReports";
    case "dashboard_updated":
      return "dashboardWidgets";
    case "exchange_rate_updated":
      return "exchangeRates";
    case "settings_updated":
      return "settings";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Event handler — server events → collection mutations
// ---------------------------------------------------------------------------

function applyEvent(eventType: string, payload: unknown) {
  switch (eventType) {
    case "account_created":
    case "account_updated": {
      const event = payload as SyncEventPayloadMap["account_created"];
      syncUpsert("accounts", event.row.id, event.row);
      break;
    }
    case "account_closed": {
      const event = payload as SyncEventPayloadMap["account_closed"];
      syncUpsert("accounts", event.id, { id: event.id, closed: true, updatedAt: event.closedAt });
      break;
    }
    case "account_deleted": {
      const event = payload as SyncEventPayloadMap["account_deleted"];
      syncDelete("accounts", event.id);
      break;
    }
    case "transaction_created":
    case "transaction_updated": {
      const event = payload as SyncEventPayloadMap["transaction_created"];
      syncUpsert("transactions", event.row.id, event.row);
      break;
    }
    case "transaction_deleted": {
      const event = payload as SyncEventPayloadMap["transaction_deleted"];
      syncDelete("transactions", event.id);
      break;
    }
    case "category_created":
    case "category_updated": {
      const event = payload as SyncEventPayloadMap["category_created"];
      syncUpsert("categories", event.row.id, event.row);
      break;
    }
    case "category_group_created":
    case "category_group_updated": {
      const event = payload as SyncEventPayloadMap["category_group_created"];
      syncUpsert("categoryGroups", event.row.id, event.row);
      break;
    }
    case "payee_created":
    case "payee_updated": {
      const event = payload as SyncEventPayloadMap["payee_created"];
      syncUpsert("payees", event.row.id, event.row);
      break;
    }
    case "payees_merged": {
      const event = payload as SyncEventPayloadMap["payees_merged"];
      for (const sourceId of event.sourceIds) {
        syncDelete("payees", sourceId);
      }
      break;
    }
    case "schedule_created":
    case "schedule_updated": {
      const event = payload as SyncEventPayloadMap["schedule_created"];
      syncUpsert("schedules", event.row.id, event.row);
      break;
    }
    case "schedule_deleted": {
      const event = payload as SyncEventPayloadMap["schedule_deleted"];
      syncDelete("schedules", event.id);
      break;
    }
    case "rule_created":
    case "rule_updated": {
      const event = payload as SyncEventPayloadMap["rule_created"];
      syncUpsert("rules", event.row.id, event.row);
      break;
    }
    case "tag_created": {
      const event = payload as SyncEventPayloadMap["tag_created"];
      syncUpsert("tags", event.row.id, event.row);
      break;
    }
    case "tag_deleted": {
      const event = payload as SyncEventPayloadMap["tag_deleted"];
      syncDelete("tags", event.id);
      break;
    }
    case "transaction_tag_added": {
      const event = payload as SyncEventPayloadMap["transaction_tag_added"];
      syncUpsert("transactionTags", `${event.transactionId}_${event.tagId}`, {
        transactionId: event.transactionId,
        tagId: event.tagId,
      });
      break;
    }
    case "transaction_tag_removed": {
      const event = payload as SyncEventPayloadMap["transaction_tag_removed"];
      syncDelete("transactionTags", `${event.transactionId}_${event.tagId}`);
      break;
    }
    case "budget_recalculated": {
      // These are derived-state events — they don't update collections directly
      // but they can be used for UI reactivity (e.g., toast notification)
      break;
    }
    case "category_leftover_changed": {
      // Computed value event — clients can react to this for UI updates
      break;
    }
    case "category_budget_set": {
      const event = payload as SyncEventPayloadMap["category_budget_set"];
      const budgetId = `${event.month}-${event.categoryId}`;
      syncUpsert("budgets", budgetId, {
        id: budgetId,
        month: event.month,
        categoryId: event.categoryId,
        amount: event.amount,
        carryover: event.carryover,
      });
      break;
    }
    case "transactions_imported": {
      // Informational event — UI can show a toast
      break;
    }
    case "report_created":
    case "report_updated": {
      const event = payload as SyncEventPayloadMap["report_created"];
      syncUpsert("customReports", event.row.id, event.row);
      break;
    }
    case "dashboard_updated": {
      const event = payload as SyncEventPayloadMap["dashboard_updated"];
      // Delete all existing widgets, then insert new ones
      const writer = getSyncWriter("dashboardWidgets");
      if (writer) {
        writer.begin();
        writer.truncate();
        for (const widget of event.widgets) {
          writer.write({ type: "insert", value: widget });
        }
        writer.commit();
      }
      break;
    }
    case "exchange_rate_updated": {
      const event = payload as SyncEventPayloadMap["exchange_rate_updated"];
      syncUpsert("exchangeRates", "latest", {
        id: "latest",
        usdToIdr: event.usdToIdr,
        updatedAt: event.updatedAt,
      });
      break;
    }
    case "settings_updated": {
      const event = payload as SyncEventPayloadMap["settings_updated"];
      syncUpsert("settings", event.row.id, event.row);
      break;
    }
    case "server_state_rebased": {
      const event = payload as SyncEventPayloadMap["server_state_rebased"];
      applySnapshot(event.snapshot.tables);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Snapshot replacement — full state reset
// ---------------------------------------------------------------------------

function applySnapshot(tables: SyncTables | undefined) {
  if (!tables) return;
  for (const [tableName, collectionId] of Object.entries(TABLE_TO_COLLECTION)) {
    const writer = getSyncWriter(collectionId);
    if (!writer) continue;
    writer.begin();
    writer.truncate();
    const rows = (tables as Record<string, Record<string, unknown> | undefined>)[tableName];
    if (rows) {
      for (const value of Object.values(rows)) {
        writer.write({ type: "insert", value: value as object });
      }
    }
    writer.commit();
    writer.markReady();
  }
}

// ---------------------------------------------------------------------------
// Envelope processor — called by ws-connection with batched envelopes
// ---------------------------------------------------------------------------

export function processEnvelopes(envelopes: SyncServerEnvelope[]) {
  let index = 0;
  let shouldRefreshCachedSnapshot = false;

  while (index < envelopes.length) {
    const envelope = envelopes[index]!;

    if (envelope.type === "event") {
      // Collect consecutive events, coalesce, apply
      const events: EventEnvelope[] = [];
      while (envelopes[index]?.type === "event") {
        events.push(envelopes[index] as EventEnvelope);
        index += 1;
      }
      const lastSeq = events.at(-1)!.serverSeq;
      conn.setLastServerSeq(lastSeq);

      const coalesced = coalesceEvents(events);
      beginBatch();
      for (const evt of coalesced) {
        applyEvent(evt.eventType, evt.payload);
      }
      flushBatch();
      shouldRefreshCachedSnapshot = true;
      continue;
    }

    switch (envelope.type) {
      case "hello_ack": {
        console.log("[sync] hello_ack", {
          protocolVersion: envelope.protocolVersion,
          serverSeq: envelope.lastServerSeq,
          localSeq: conn.getLastServerSeq(),
        });
        if (envelope.lastServerSeq > conn.getLastServerSeq()) {
          conn.setLastServerSeq(envelope.lastServerSeq);
        }
        pendingOps.flushAll();
        break;
      }

      case "ack": {
        pendingOps.resolve(envelope.opId);
        break;
      }

      case "reject": {
        pendingOps.reject(envelope.opId, envelope.reason);
        break;
      }

      case "sync_reset": {
        console.log(`[sync] sync_reset reason=${envelope.reason}`, {
          protocolVersion: envelope.protocolVersion,
          serverSeq: envelope.snapshot.serverSeq ?? null,
        });
        if (envelope.reason !== "initial_sync") {
          pendingOps.clear();
        }
        applySnapshot(envelope.snapshot.tables);
        if (typeof envelope.snapshot.serverSeq === "number") {
          conn.setLastServerSeq(envelope.snapshot.serverSeq);
        }
        shouldRefreshCachedSnapshot = true;
        void writeCachedSnapshot(
          envelope.snapshot.tables ?? {},
          envelope.snapshot.serverSeq ?? conn.getLastServerSeq(),
        );
        break;
      }

      case "pong":
        break;
    }
    index += 1;
  }

  if (shouldRefreshCachedSnapshot) {
    void writeCachedSnapshot(buildCachedSnapshotTables(), conn.getLastServerSeq());
  }
}

function buildCachedSnapshotTables(): SyncTables {
  const tables: SyncTables = {};
  const snapshot: Record<string, any> = {
    accounts: accountsCollection,
    transactions: transactionsCollection,
    categories: categoriesCollection,
    categoryGroups: categoryGroupsCollection,
    budgets: budgetsCollection,
    budgetMonths: budgetMonthsCollection,
    payees: payeesCollection,
    schedules: schedulesCollection,
    rules: rulesCollection,
    tags: tagsCollection,
    transactionTags: transactionTagsCollection,
    customReports: customReportsCollection,
    dashboardWidgets: dashboardWidgetsCollection,
    exchangeRates: exchangeRatesCollection,
    settings: settingsCollection,
  };

  for (const [tableName, collection] of Object.entries(snapshot)) {
    const collectionId = TABLE_TO_COLLECTION[tableName];
    if (!collectionId) continue;
    const items = collection.state.values() as Iterable<{ id: string }>;
    const rows: Record<string, unknown> = {};
    for (const item of items) {
      rows[item.id] = item;
    }
    (tables as Record<string, unknown>)[tableName] = rows;
  }

  return tables;
}

// ---------------------------------------------------------------------------
// Initialization — wire up ws-connection and hydrate from offline cache
// ---------------------------------------------------------------------------

export async function init() {
  conn.setOnEnvelopes(processEnvelopes);

  // Mark all collections as ready immediately
  for (const [, collectionId] of Object.entries(TABLE_TO_COLLECTION)) {
    const writer = getSyncWriter(collectionId);
    writer?.markReady();
  }

  // Try to hydrate from IndexedDB cache before WS connects
  const cached = await readCachedSnapshot();
  if (cached) {
    console.log("[sync] hydrating from offline cache", {
      lastServerSeq: cached.lastServerSeq,
      tableCount: Object.keys(cached.tables).length,
    });
    conn.setLastServerSeq(cached.lastServerSeq);
    applySnapshot(cached.tables);
  }
}
