import type { Db } from "../d1-access";
import { decodeCommand } from "../../domain/commands";
import { isSyncCommandType } from "../../domain/types";
import { handleAccountCommands } from "./accounts";
import { handleTransactionCommands } from "./transactions";
import { handleCategoryCommands } from "./categories";
import { handleBudgetCommands } from "./budget";
import { handlePayeeCommands } from "./payees";
import { handleScheduleCommands } from "./schedules";
import { handleRuleCommands } from "./rules";
import { handleTagCommands } from "./tags";
import { handleImportCommands } from "./import";
import { handleFilterCommands } from "./filters";
import { handleReportCommands } from "./reports";
import { handleSettingCommands } from "./settings";
import { handleNotesCommands } from "./notes";
import { handleDashboardCommands } from "./dashboard";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export async function handleCommand(db: Db, body: Record<string, unknown>): Promise<CommandResult> {
  const commandType = body.commandType as string;
  if (!commandType) return { ok: false, error: "Missing commandType" };
  if (!isSyncCommandType(commandType)) {
    return { ok: false, error: `Unknown command: ${commandType}` };
  }

  try {
    const payload = (decodeCommand as any)(commandType, body.payload ?? body);
    return routeCommand(commandType, payload, db);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Validation failed" };
  }
}

async function routeCommand(commandType: string, payload: any, db: Db): Promise<CommandResult> {
  switch (commandType) {
    case "create_account":
    case "update_account":
    case "delete_account":
    case "close_account":
    case "reopen_account":
    case "reorder_accounts":
    case "update_exchange_rate":
      return handleAccountCommands(commandType, payload, db);

    case "create_transaction":
    case "update_transaction":
    case "delete_transaction":
    case "split_transaction":
      return handleTransactionCommands(commandType, payload, db);

    case "create_category":
    case "update_category":
    case "delete_category":
    case "create_category_group":
    case "update_category_group":
    case "delete_category_group":
    case "reorder_categories":
      return handleCategoryCommands(commandType, payload, db);

    case "set_budget_amount":
    case "set_budget_carryover":
    case "set_buffer":
    case "copy_previous_month":
    case "set_3month_avg":
    case "set_nmonth_avg":
    case "set_zero":
    case "apply_goal_templates":
    case "cover_overspending":
    case "transfer_budget":
    case "hold_for_next_month":
      return handleBudgetCommands(commandType, payload, db);

    case "create_payee":
    case "update_payee":
    case "merge_payees":
      return handlePayeeCommands(commandType, payload, db);

    case "create_schedule":
    case "update_schedule":
    case "delete_schedule":
    case "skip_schedule_date":
    case "post_schedule_transaction":
      return handleScheduleCommands(commandType, payload, db);

    case "create_rule":
    case "update_rule":
    case "delete_rule":
      return handleRuleCommands(commandType, payload, db);

    case "create_tag":
    case "delete_tag":
    case "add_transaction_tag":
    case "remove_transaction_tag":
      return handleTagCommands(commandType, payload, db);

    case "import_transactions":
      return handleImportCommands(commandType, payload, db);

    case "create_filter":
    case "update_filter":
    case "delete_filter":
      return handleFilterCommands(commandType, payload, db);

    case "create_report":
    case "update_report":
    case "delete_report":
      return handleReportCommands(commandType, payload, db);

    case "update_setting":
      return handleSettingCommands(commandType, payload, db);

    case "create_note":
    case "update_note":
    case "delete_note":
    case "list_notes":
      return handleNotesCommands(commandType, payload, db);

    case "update_dashboard":
      return handleDashboardCommands(commandType, payload, db);

    default:
      return { ok: false, error: `Unhandled command: ${commandType}` };
  }
}
