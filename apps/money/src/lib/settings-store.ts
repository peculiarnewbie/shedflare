/**
 * Simple reactive settings store.
 * Replaces TanStack DB settingsCollection for local read access.
 */

import { createSignal } from "solid-js";

type SettingsMap = Record<string, string>;
const [settingsMap, setSettingsMap] = createSignal<SettingsMap>({});

export function loadSettings() {
  fetch("/api/settings")
    .then((r) => r.json())
    .then((data: any) => {
      const map: Record<string, string> = {};
      for (const s of data.settings ?? []) {
        map[s.key] = s.value;
      }
      setSettingsMap(map);
    })
    .catch(() => {});
}

export function getSetting(key: string, fallback: string): string {
  return settingsMap()[key] ?? fallback;
}

// Collection-like interface for compatibility (matches old TanStack DB usage)
export const settingsCollection = {
  get state() {
    return {
      values() {
        return Object.entries(settingsMap()).map(([k, v]: [string, string]) => ({
          id: k,
          key: k,
          value: v,
        }));
      },
      get(key: string) {
        return { key, value: settingsMap()[key] ?? "" };
      },
    };
  },
  get(key: string) {
    return { key, value: settingsMap()[key] ?? "" };
  },
  subscribeChanges(_fn: () => void) {
    return { unsubscribe: () => {} };
  },
};
