import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function handleSettingCommands(
  c: string,
  p: CommandPayloadMap["update_setting"],
  db: Db,
): Promise<CR> {
  if (c !== "update_setting") return { ok: false, error: `Unknown setting command: ${c}` };
  await db
    .insert(s.settings)
    .values({ id: `setting-${p.key}`, key: p.key, value: p.value, updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: p.value, updatedAt: nowIso() },
    });
  return { ok: true, data: { key: p.key, value: p.value } };
}
