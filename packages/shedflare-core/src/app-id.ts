// Generated from apps/*/shedflare.app.jsonc. Do not edit.

export const APP_IDS = [
  "anki",
  "auth",
  "cf-bill",
  "chat",
  "discord",
  "drive",
  "homepage",
  "money",
  "observability",
  "routines",
  "s",
] as const;

export type AppId = (typeof APP_IDS)[number];

const APP_ID_SET: ReadonlySet<string> = new Set(APP_IDS);

export function isAppId(value: string): value is AppId {
  return APP_ID_SET.has(value);
}
