import type { DataAccess } from "../data-access";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export function handleSettingCommands(c: string, p: any, a: DataAccess): CR {
  if (c !== "update_setting") return { ok: false, error: `Unknown setting command: ${c}` };
  const now = new Date().toISOString();
  a.exec(
    `INSERT OR REPLACE INTO settings (id, key, value, updated_at) VALUES (?, ?, ?, ?)`,
    `setting-${p.key}`,
    p.key,
    p.value,
    now,
  );
  return { ok: true, data: { key: p.key, value: p.value } };
}
