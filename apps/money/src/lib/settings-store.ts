/**
 * Simple reactive settings store with localStorage caching.
 * Replaces TanStack DB settingsCollection for local read access.
 */

import { createSignal } from "solid-js";

type SettingsMap = Record<string, string>;

const STORAGE_KEY = "shedflare.money.settings";

function readStorage(): SettingsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function writeStorage(map: SettingsMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

// Seed from localStorage so values are available instantly on page load
// without waiting for the server fetch.
const [settingsMap, setSettingsMap] = createSignal<SettingsMap>(readStorage());

export function loadSettings() {
  fetch("/api/settings")
    .then((r) => r.json())
    .then((data: any) => {
      const map: Record<string, string> = {};
      for (const s of data.settings ?? []) {
        map[s.key] = s.value;
      }
      setSettingsMap(map);
      writeStorage(map);
    })
    .catch(() => {
      console.warn("[settings-store] failed to load settings");
    });
}

export function getSetting(key: string, fallback: string): string {
  return settingsMap()[key] ?? fallback;
}

export function setSetting(key: string, value: string): void {
  setSettingsMap((prev) => {
    const next = { ...prev, [key]: value };
    writeStorage(next);
    return next;
  });
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
