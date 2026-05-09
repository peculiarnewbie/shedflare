/**
 * Import command handler — CSV/parsed transaction import.
 * The import pipeline runs rules, matches existing transactions, and inserts new ones.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createTransaction } from "../../domain/factories";
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

  const accountId = payload.accountId;
  const transactions: Array<{
    date: string;
    amount: number;
    payee?: string;
    notes?: string;
    category?: string;
    importedDescription?: string;
  }> = payload.transactions ?? [];

  if (!accountId || transactions.length === 0) {
    return { events };
  }

  let added = 0;
  let updated = 0;
  const errors: string[] = [];

  // Load all rules for auto-categorization
  const rules = access.queryAll<Record<string, unknown>>(
    `SELECT * FROM rules WHERE stage = 'pre' ORDER BY created_at`,
  );

  // Load all payees for matching
  const allPayees = access.queryAll<{ id: string; name: string }>(`SELECT id, name FROM payees`);
  const payeeByName = new Map(allPayees.map((p) => [p.name.toLowerCase(), p.id]));

  for (const txInput of transactions) {
    try {
      let categoryId: string | null = null;
      let payeeName = txInput.payee ?? null;

      // Run rules: conditions matched against payee/importedDescription → actions
      if (rules.length > 0) {
        for (const rule of rules) {
          try {
            const conditions = JSON.parse(String(rule.conditions ?? "[]")) as Array<any>;
            const actions = JSON.parse(String(rule.actions ?? "[]")) as Array<any>;

            // Simple condition matching: if any condition matches payee or description
            const matches = conditions.some((cond: any) => {
              if (!cond || !cond.field) return false;
              const fieldValue =
                cond.field === "payee"
                  ? payeeName
                  : cond.field === "imported_description"
                    ? txInput.importedDescription
                    : "";
              const op = cond.op ?? "is";
              const value = String(cond.value ?? "").toLowerCase();
              const fv = String(fieldValue ?? "").toLowerCase();

              switch (op) {
                case "is":
                  return fv === value;
                case "contains":
                  return fv.includes(value);
                case "matches":
                  return new RegExp(value).test(fv);
                case "isnot":
                  return fv !== value;
                case "oneOf":
                  return ((cond.value as string[]) ?? []).includes(fv);
                default:
                  return false;
              }
            });

            if (matches) {
              for (const action of actions) {
                if (action.op === "set" && action.field === "category") {
                  categoryId = action.value;
                }
                if (action.op === "set" && action.field === "payee") {
                  payeeName = action.value;
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
