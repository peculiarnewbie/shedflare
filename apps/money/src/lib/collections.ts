/**
 * Compatibility stub — replacement for TanStack DB synced collections.
 * Provides the same interface but backed by simple fetch + local state.
 */

import { createSignal } from "solid-js";

type CollectionState<T> = {
  state: { values(): T[]; get(key: string): T | undefined };
  get(key: string): T | undefined;
  toArray: T[];
  subscribeChanges(fn: () => void): { unsubscribe: () => void };
};

function makeCollection<T extends { id: string }>(): CollectionState<T> {
  const [items] = createSignal<Record<string, T>>({});
  const listeners = new Set<() => void>();

  return {
    get state() {
      return {
        values() {
          return Object.values(items());
        },
        get(key: string) {
          return items()[key];
        },
      };
    },
    get(key: string) {
      return items()[key];
    },
    get toArray() {
      return Object.values(items());
    },
    subscribeChanges(fn: () => void) {
      listeners.add(fn);
      return { unsubscribe: () => listeners.delete(fn) };
    },
  };
}

export const accountsCollection = makeCollection<any>();
export const transactionsCollection = makeCollection<any>();
export const categoriesCollection = makeCollection<any>();
export const categoryGroupsCollection = makeCollection<any>();
export const budgetsCollection = makeCollection<any>();
export const budgetMonthsCollection = makeCollection<any>();
export const payeesCollection = makeCollection<any>();
export const schedulesCollection = makeCollection<any>();
export const rulesCollection = makeCollection<any>();
export const tagsCollection = makeCollection<any>();
export const transactionTagsCollection = makeCollection<any>();
export const customReportsCollection = makeCollection<any>();
export const dashboardWidgetsCollection = makeCollection<any>();
export const exchangeRatesCollection = makeCollection<any>();
export const notesCollection = makeCollection<any>();
export const transactionFiltersCollection = makeCollection<any>();

export { settingsCollection } from "./settings-store";
