import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { nowIso } from "../../domain/types";
import type { CommandInvocation } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

export async function handleSettingCommands(
  command: Extract<CommandInvocation, { commandType: "update_setting" }>,
  db: Db,
): Promise<CommandResult> {
  const p = command.payload;
  await db
    .insert(s.settings)
    .values({ id: `setting-${p.key}`, key: p.key, value: p.value, updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: p.value, updatedAt: nowIso() },
    })
    .run();
  return { ok: true, data: { key: p.key, value: p.value } };
}
