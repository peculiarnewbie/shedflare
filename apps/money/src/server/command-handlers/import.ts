/**
 * Import command handler — CSV/parsed transaction import.
 * The import pipeline runs rules, matches existing transactions, and inserts new ones.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createTransaction } from "../../domain/factories";
import { decodeCommand } from "../../domain/commands";
import { computeMonthBudget } from "../budget-engine";
import { toMonthInt } from "../../domain/types";

export function handleImportCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  if (payload.commandType !== "import_transactions") {
    return { events };
  }

  const valid = decodeCommand("import_transactions", payload);
  const accountId = valid.accountId;
  const transactions = valid.transactions ?? [];

  if (!accountId || transactions.length === 0) {
    return { events };
  }

  let added = 0;
  let updated = 0;
  const errors: string[] = [];

  // Load all rules for auto-categorization
  const rules = access.queryAll<Record<string, unknown>>(
    `SELECT * FROM rules WHERE stage = 'pre' AND deleted = 0 ORDER BY created_at`,
  );

  txLoop: for (const txInput of transactions) {
    try {
      let categoryId: string | null = null;
      let payeeName = txInput.payee ?? null;

      // Run rules: conditions matched against payee/importedDescription → actions
      if (rules.length > 0) {
        for (const rule of rules) {
          try {
            const conditions = JSON.parse((rule.conditions as string) ?? "[]") as Array<any>;
            const actions = JSON.parse((rule.actions as string) ?? "[]") as Array<any>;

            const matches = conditions.some((cond: any) => {
              if (!cond || !cond.field) return false;
              const op = cond.op ?? "is";

              const txDate = txInput.date ? new Date(txInput.date) : null;
              const txCleared = (txInput as any).cleared ?? true;

              const fieldResolvers: Record<string, () => any> = {
                payee: () => payeeName,
                imported_description: () => txInput.importedDescription,
                notes: () => txInput.notes,
                account: () => txInput.account ?? (txInput as any).accountName,
                amount: () => txInput.amount,
                date: () => txDate,
                cleared: () => txCleared,
              };

              const fieldValue = fieldResolvers[cond.field]?.() ?? "";

              switch (op) {
                case "is": {
                  if (cond.field === "cleared") {
                    return fieldValue === cond.value;
                  }
                  const fv = String(fieldValue ?? "").toLowerCase();
                  const value = String(cond.value ?? "").toLowerCase();
                  return fv === value;
                }
                case "isNot": {
                  const fv = String(fieldValue ?? "").toLowerCase();
                  const value = String(cond.value ?? "").toLowerCase();
                  return fv !== value;
                }
                case "oneOf": {
                  const fv = String(fieldValue ?? "").toLowerCase();
                  return ((cond.value as string[]) ?? [])
                    .map((v: string) => v.toLowerCase())
                    .includes(fv);
                }
                case "contains": {
                  const fv = String(fieldValue ?? "").toLowerCase();
                  const value = String(cond.value ?? "").toLowerCase();
                  return fv.includes(value);
                }
                case "doesNotContain": {
                  const fv = String(fieldValue ?? "").toLowerCase();
                  const value = String(cond.value ?? "").toLowerCase();
                  return !fv.includes(value);
                }
                case "matches":
                  return new RegExp(String(cond.value ?? "")).test(String(fieldValue ?? ""));
                case "isapprox": {
                  const fv = Number(fieldValue) || 0;
                  const value = Number(cond.value) || 0;
                  return Math.abs(fv - value) <= Math.max(Math.abs(value) * 0.1, 1);
                }
                case "isbetween": {
                  const fv = Number(fieldValue) || 0;
                  const min = Number(cond.value) || 0;
                  const max = Number(cond.value2) || 0;
                  return fv >= min && fv <= max;
                }
                case "gt": {
                  const fv = Number(fieldValue) || 0;
                  const value = Number(cond.value) || 0;
                  return fv > value;
                }
                case "gte": {
                  const fv = Number(fieldValue) || 0;
                  const value = Number(cond.value) || 0;
                  return fv >= value;
                }
                case "lt": {
                  const fv = Number(fieldValue) || 0;
                  const value = Number(cond.value) || 0;
                  return fv < value;
                }
                case "lte": {
                  const fv = Number(fieldValue) || 0;
                  const value = Number(cond.value) || 0;
                  return fv <= value;
                }
                default:
                  return false;
              }
            });

            if (matches) {
              for (const action of actions) {
                if (action.op === "delete-transaction") {
                  continue txLoop;
                }
                if (action.op === "set" && action.field === "category") {
                  categoryId = action.value;
                }
                if (action.op === "set" && action.field === "payee") {
                  payeeName = action.value;
                }
                if (action.op === "set" && action.field === "notes") {
                  txInput.notes = action.value;
                }
                if (action.op === "prepend-notes") {
                  txInput.notes = action.value + (txInput.notes ?? "");
                }
                if (action.op === "append-notes") {
                  txInput.notes = (txInput.notes ?? "") + action.value;
                }
              }
            }
          } catch {
            // Skip malformed rules
          }
        }
      }

      // Check for existing transaction (by date + amount + payee)
      const existing = access.queryOne<{ id: string }>(
        `SELECT id FROM transactions WHERE date = ? AND amount = ? AND payee = ? AND account_id = ?`,
        txInput.date,
        txInput.amount,
        payeeName,
        accountId,
      );

      const row = createTransaction({
        accountId,
        categoryId: categoryId ?? undefined,
        amount: txInput.amount,
        payee: payeeName ?? undefined,
        notes: txInput.notes,
        date: txInput.date,
        importedDescription: txInput.importedDescription,
      });

      if (existing) {
        // Update existing
        row.id = existing.id;
        events.push(
          eventStore.insertEvent(opId, "transaction_updated", { row }) as SyncServerEvent,
        );
        updated++;
      } else {
        events.push(
          eventStore.insertEvent(opId, "transaction_created", { row }) as SyncServerEvent,
        );
        added++;
      }
    } catch (err) {
      errors.push(
        `Failed to import transaction: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Budget recalculation for the affected month
  if (added > 0 || updated > 0) {
    const firstTx = transactions[0];
    if (firstTx?.date) {
      const month = toMonthInt(firstTx.date.slice(0, 7));
      const result = computeMonthBudget(access, month);
      if (result) {
        events.push(
          eventStore.insertEvent(opId, "budget_recalculated", {
            month: result.month,
            toBudget: result.toBudget,
            buffered: result.buffered,
          }) as SyncServerEvent,
        );
      }
    }
  }

  events.push(
    eventStore.insertEvent(opId, "transactions_imported", {
      accountId,
      added,
      updated,
      errors,
    }) as SyncServerEvent,
  );

  return { events };
}
