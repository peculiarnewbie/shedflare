/**
 * TanStack DB collection definitions for all budget tables.
 * Each collection is a synced collection backed by the DO via WebSocket events.
 */
import { createCollection, type ChangeMessageOrDeleteKeyMessage } from "@tanstack/db";
import type {
  Account, Transaction, Category, CategoryGroup, Payee,
  Schedule, Rule, Tag, CustomReport, DashboardWidget, Budget, BudgetMonth, ExchangeRate,
} from "../db/schema";

// ---------------------------------------------------------------------------
// Sync writer type
// ---------------------------------------------------------------------------

export type SyncWriter<T extends object, TKey extends string | number = string> = {
  begin: (options?: { immediate?: boolean }) => void;
  write: (msg: ChangeMessageOrDeleteKeyMessage<T, TKey>) => void;
  commit: () => void;
  markReady: () => void;
  truncate: () => void;
};

export const COLLECTION_IDS = [
  "accounts",
  "transactions",
  "categories",
  "categoryGroups",
  "budgets",
  "budgetMonths",
  "payees",
  "schedules",
  "rules",
  "tags",
  "customReports",
  "dashboardWidgets",
  "exchangeRates",
] as const;

export type CollectionId = (typeof COLLECTION_IDS)[number];

const channels = new Map<string, SyncWriter<any, any>>();

export function getSyncWriter<T extends object>(collectionId: string): SyncWriter<T, string> | undefined {
  return channels.get(collectionId);
}

function requireSyncWriter<T extends object>(collectionId: CollectionId): SyncWriter<T, string> {
  const writer = getSyncWriter<T>(collectionId);
  if (!writer) {
    throw new Error(`Sync writer not ready for collection "${collectionId}"`);
  }
  return writer;
}

function commitImmediateWrite<T extends object>(
  collectionId: CollectionId,
  message: ChangeMessageOrDeleteKeyMessage<T, string>,
) {
  const writer = requireSyncWriter<T>(collectionId);
  writer.begin({ immediate: true });
  writer.write(message);
  writer.commit();
}

function createSyncedCollection<T extends object>(id: string, getKey: (item: T) => string) {
  return createCollection<T, string>({
    id,
    getKey,
    startSync: true,
    utils: {},
    sync: {
      sync: ({ begin, write, commit, markReady, truncate }) => {
        channels.set(id, { begin, write, commit, markReady, truncate } as SyncWriter<any, any>);
        return () => channels.delete(id);
      },
    },
    onInsert: () => Promise.resolve(),
    onUpdate: () => Promise.resolve(),
    onDelete: () => Promise.resolve(),
  });
}

// ---------------------------------------------------------------------------
// Collection definitions
// ---------------------------------------------------------------------------

export const accountsCollection = createSyncedCollection<Account>("accounts", (a) => a.id);
export const transactionsCollection = createSyncedCollection<Transaction>("transactions", (t) => t.id);
export const categoriesCollection = createSyncedCollection<Category>("categories", (c) => c.id);
export const categoryGroupsCollection = createSyncedCollection<CategoryGroup>("categoryGroups", (cg) => cg.id);
export const budgetsCollection = createSyncedCollection<Budget>("budgets", (b) => b.id);
export const budgetMonthsCollection = createSyncedCollection<BudgetMonth>("budgetMonths", (bm) => bm.id);
export const payeesCollection = createSyncedCollection<Payee>("payees", (p) => p.id);
export const schedulesCollection = createSyncedCollection<Schedule>("schedules", (s) => s.id);
export const rulesCollection = createSyncedCollection<Rule>("rules", (r) => r.id);
export const tagsCollection = createSyncedCollection<Tag>("tags", (t) => t.id);
export const customReportsCollection = createSyncedCollection<CustomReport>("customReports", (cr) => cr.id);
export const dashboardWidgetsCollection = createSyncedCollection<DashboardWidget>("dashboardWidgets", (dw) => dw.id);
export const exchangeRatesCollection = createSyncedCollection<ExchangeRate>("exchangeRates", (er) => er.id);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function applyLocalInsert<T extends object>(collectionId: CollectionId, value: T) {
  commitImmediateWrite(collectionId, { type: "insert", value });
}

export function applyLocalUpdate<T extends object>(collectionId: CollectionId, value: T) {
  commitImmediateWrite(collectionId, { type: "update", value });
}

export function applyLocalDelete(collectionId: CollectionId, key: string) {
  commitImmediateWrite(collectionId, { key, type: "delete" });
}

export function resetCollections(collectionIds?: readonly CollectionId[]) {
  const ids = collectionIds ?? COLLECTION_IDS;
  for (const collectionId of ids) {
    const writer = getSyncWriter(collectionId);
    if (!writer) continue;
    writer.begin({ immediate: true });
    writer.truncate();
    writer.commit();
    writer.markReady();
  }
}

// Map from server table names (used in SyncSnapshot) to collection ids
export const TABLE_TO_COLLECTION: Record<string, string> = {
  accounts: "accounts",
  transactions: "transactions",
  categories: "categories",
  category_groups: "categoryGroups",
  budgets: "budgets",
  budget_months: "budgetMonths",
  payees: "payees",
  schedules: "schedules",
  rules: "rules",
  tags: "tags",
  custom_reports: "customReports",
  dashboard_widgets: "dashboardWidgets",
  exchange_rates: "exchangeRates",
};
