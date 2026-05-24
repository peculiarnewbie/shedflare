/**
 * Projection — applies events to the materialized SQLite state.
 *
 * Separated from EventStore to decouple event persistence from projection logic.
 */
import type {
  Account,
  Transaction,
  Category,
  CategoryGroup,
  Payee,
  Schedule,
  Rule,
  Tag,
  CustomReport,
  DashboardWidget,
  Setting,
} from "../db/schema";
import type { SyncSnapshot } from "../domain/types";
import type { DataAccess } from "./data-access";
import { boolToSql, DATA_TABLES } from "./sync-utils";
import { nowIso } from "../domain/types";

export class Projection {
  constructor(private readonly access: DataAccess) {}

  apply(eventType: string, payload: any) {
    const { access } = this;
    switch (eventType) {
      case "account_created":
      case "account_updated": {
        const row = payload.row as Account;
        this.execAccountUpsert(row);
        break;
      }
      case "account_closed": {
        const existing = access.queryOne<Record<string, unknown>>(
          `SELECT * FROM accounts WHERE id = ?`,
          payload.id,
        );
        if (existing) {
          this.execAccountUpsert({
            ...existing,
            closed: true,
            updatedAt: payload.closedAt,
          } as unknown as Account);
        }
        break;
      }
      case "account_deleted": {
        access.exec(`DELETE FROM transactions WHERE account_id = ?`, payload.id);
        access.exec(`DELETE FROM accounts WHERE id = ?`, payload.id);
        break;
      }
      case "transaction_created":
      case "transaction_updated": {
        const row = payload.row as Transaction;
        this.execTransactionUpsert(row);
        break;
      }
      case "transaction_deleted": {
        access.exec(`DELETE FROM transactions WHERE id = ?`, payload.id);
        break;
      }
      case "category_created":
      case "category_updated": {
        const row = payload.row as Category;
        this.execCategoryUpsert(row);
        break;
      }
      case "category_group_created":
      case "category_group_updated": {
        const row = payload.row as CategoryGroup;
        this.execCategoryGroupUpsert(row);
        break;
      }
      case "category_group_deleted": {
        access.exec(`DELETE FROM category_groups WHERE id = ?`, payload.id);
        break;
      }
      case "payee_created":
      case "payee_updated": {
        const row = payload.row as Payee;
        this.execPayeeUpsert(row);
        break;
      }
      case "payees_merged": {
        for (const sourceId of payload.sourceIds) {
          access.exec(
            `UPDATE transactions SET payee = NULL WHERE payee = (SELECT name FROM payees WHERE id = ?)`,
            sourceId,
          );
          access.exec(`DELETE FROM payees WHERE id = ?`, sourceId);
        }
        break;
      }
      case "schedule_created":
      case "schedule_updated": {
        const row = payload.row as Schedule;
        this.execScheduleUpsert(row);
        break;
      }
      case "schedule_deleted": {
        access.exec(`DELETE FROM schedules WHERE id = ?`, payload.id);
        break;
      }
      case "rule_created":
      case "rule_updated": {
        const row = payload.row as Rule;
        this.execRuleUpsert(row);
        break;
      }
      case "tag_created": {
        const row = payload.row as Tag;
        this.execTagUpsert(row);
        break;
      }
      case "tag_deleted": {
        access.exec(`DELETE FROM tags WHERE id = ?`, payload.id);
        break;
      }
      case "transaction_tag_added": {
        access.exec(
          `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)`,
          payload.transactionId,
          payload.tagId,
        );
        break;
      }
      case "transaction_tag_removed": {
        access.exec(
          `DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?`,
          payload.transactionId,
          payload.tagId,
        );
        break;
      }
      case "report_created":
      case "report_updated": {
        const row = payload.row as CustomReport;
        this.execReportUpsert(row);
        break;
      }
      case "dashboard_updated": {
        access.exec(`DELETE FROM dashboard_widgets`);
        for (const widget of payload.widgets) {
          this.execDashboardWidgetUpsert(widget);
        }
        break;
      }
      case "exchange_rate_updated": {
        access.exec(
          `INSERT OR REPLACE INTO exchange_rates (id, usd_to_idr, updated_at) VALUES (?, ?, ?)`,
          "latest",
          payload.usdToIdr,
          payload.updatedAt,
        );
        break;
      }
      case "settings_updated": {
        const row = payload.row as Setting;
        this.execSettingUpsert(row);
        break;
      }
      case "category_budget_set": {
        const id = `${payload.month}-${payload.categoryId}`;
        access.exec(
          `INSERT OR REPLACE INTO budgets (id, month, category_id, amount, carryover, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          id,
          payload.month,
          payload.categoryId,
          payload.amount,
          boolToSql(payload.carryover),
          nowIso(),
          nowIso(),
        );
        break;
      }
      case "budget_recalculated": {
        const monthKey = `${Math.floor(payload.month / 100)}-${String(payload.month % 100).padStart(2, "0")}`;
        access.exec(
          `INSERT OR REPLACE INTO budget_months (id, buffered, created_at, updated_at)
           VALUES (?, ?, ?, ?)`,
          monthKey,
          payload.buffered,
          nowIso(),
          nowIso(),
        );
        break;
      }
    }
  }

  replaceFromSnapshot(snapshot: SyncSnapshot) {
    this.access.db.transaction(() => {
      for (const tableName of DATA_TABLES) {
        this.access.exec(`DELETE FROM ${tableName}`);
      }
      const tables = snapshot.tables ?? {};
      for (const row of Object.values(tables.accounts ?? {})) {
        this.apply("account_created", { row });
      }
      for (const row of Object.values(tables.transactions ?? {})) {
        this.apply("transaction_created", { row });
      }
      for (const row of Object.values(tables.categories ?? {})) {
        this.apply("category_created", { row });
      }
      for (const row of Object.values(tables.category_groups ?? {})) {
        this.apply("category_group_created", { row });
      }
      for (const row of Object.values(tables.payees ?? {})) {
        this.apply("payee_created", { row });
      }
      for (const row of Object.values(tables.schedules ?? {})) {
        this.apply("schedule_created", { row });
      }
      for (const row of Object.values(tables.rules ?? {})) {
        this.apply("rule_created", { row });
      }
      for (const row of Object.values(tables.tags ?? {})) {
        this.apply("tag_created", { row });
      }
      for (const row of Object.values(tables.transaction_tags ?? {})) {
        this.apply("transaction_tag_added", row);
      }
      for (const row of Object.values(tables.budgets ?? {})) {
        this.apply("category_budget_set", {
          month: row.month,
          categoryId: row.categoryId,
          amount: row.amount,
          carryover: row.carryover,
        });
      }
      for (const row of Object.values(tables.budget_months ?? {})) {
        this.execBudgetMonthUpsert(row.id, row.buffered);
      }
      for (const row of Object.values(tables.custom_reports ?? {})) {
        this.apply("report_created", { row });
      }
      for (const row of Object.values(tables.dashboard_widgets ?? {})) {
        this.execDashboardWidgetUpsert(row);
      }
      for (const row of Object.values(tables.settings ?? {})) {
        this.apply("settings_updated", { row });
      }
    });
  }

  // Raw SQL upsert helpers ------------------------------------------------

  execAccountUpsert(row: Account) {
    this.access.exec(
      `INSERT OR REPLACE INTO accounts (id, name, offbudget, closed, sort_order, balance_current, balance_available, balance_limit, mask, official_name, last_reconciled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.name,
      boolToSql(row.offbudget),
      boolToSql(row.closed),
      row.sortOrder,
      row.balanceCurrent,
      row.balanceAvailable,
      row.balanceLimit,
      row.mask,
      row.officialName,
      row.lastReconciled,
      row.createdAt,
      row.updatedAt,
    );
  }

  execTransactionUpsert(row: Transaction) {
    this.access.exec(
      `INSERT OR REPLACE INTO transactions (id, account_id, category_id, amount, payee, notes, date, cleared, imported_description, starting_balance_flag, sort_order, is_parent, is_child, parent_id, transfer_id, schedule_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.accountId,
      row.categoryId,
      row.amount,
      row.payee,
      row.notes,
      row.date,
      boolToSql(row.cleared),
      row.importedDescription,
      boolToSql(row.startingBalanceFlag),
      row.sortOrder,
      boolToSql(row.isParent),
      boolToSql(row.isChild),
      row.parentId,
      row.transferId,
      row.scheduleId,
      row.createdAt,
      row.updatedAt,
    );
  }

  execCategoryUpsert(row: Category) {
    this.access.exec(
      `INSERT OR REPLACE INTO categories (id, name, is_income, group_id, sort_order, hidden, goal_def, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.name,
      boolToSql(row.isIncome),
      row.groupId,
      row.sortOrder,
      boolToSql(row.hidden),
      row.goalDef,
      row.createdAt,
      row.updatedAt,
    );
  }

  execCategoryGroupUpsert(row: CategoryGroup) {
    this.access.exec(
      `INSERT OR REPLACE INTO category_groups (id, name, is_income, sort_order, hidden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.name,
      boolToSql(row.isIncome),
      row.sortOrder,
      boolToSql(row.hidden),
      row.createdAt,
      row.updatedAt,
    );
  }

  execPayeeUpsert(row: Payee) {
    this.access.exec(
      `INSERT OR REPLACE INTO payees (id, name, transfer_account_id, favorite, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      row.id,
      row.name,
      row.transferAccountId,
      boolToSql(row.favorite),
      row.createdAt,
      row.updatedAt,
    );
  }

  execScheduleUpsert(row: Schedule) {
    this.access.exec(
      `INSERT OR REPLACE INTO schedules (id, name, account_id, payee_id, category_id, amount, start_date, recurrence_rules, active, completed, posts_transaction, custom_upcoming_length, next_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.name,
      row.accountId,
      row.payeeId,
      row.categoryId,
      row.amount,
      row.startDate,
      row.recurrenceRules,
      boolToSql(row.active),
      boolToSql(row.completed),
      boolToSql(row.postsTransaction),
      row.customUpcomingLength,
      row.nextDate,
      row.createdAt,
      row.updatedAt,
    );
  }

  execRuleUpsert(row: Rule) {
    this.access.exec(
      `INSERT OR REPLACE INTO rules (id, stage, conditions_op, conditions, actions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.stage,
      row.conditionsOp,
      row.conditions,
      row.actions,
      row.createdAt,
      row.updatedAt,
    );
  }

  execTagUpsert(row: Tag) {
    this.access.exec(
      `INSERT OR REPLACE INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)`,
      row.id,
      row.name,
      row.color,
      row.createdAt,
    );
  }

  execReportUpsert(row: CustomReport) {
    this.access.exec(
      `INSERT OR REPLACE INTO custom_reports (id, name, start_date, end_date, date_static, date_range, mode, group_by, sort_by, interval, balance_type, show_empty, show_offbudget, show_hidden, show_uncategorized, trim_intervals, include_current, graph_type, conditions, conditions_op, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.name,
      row.startDate,
      row.endDate,
      boolToSql(row.dateStatic),
      row.dateRange,
      row.mode,
      row.groupBy,
      row.sortBy,
      row.interval,
      row.balanceType,
      boolToSql(row.showEmpty),
      boolToSql(row.showOffbudget),
      boolToSql(row.showHidden),
      boolToSql(row.showUncategorized),
      boolToSql(row.trimIntervals),
      boolToSql(row.includeCurrent),
      row.graphType,
      row.conditions,
      row.conditionsOp,
      row.metadata,
      row.createdAt,
      row.updatedAt,
    );
  }

  execDashboardWidgetUpsert(row: DashboardWidget) {
    this.access.exec(
      `INSERT OR REPLACE INTO dashboard_widgets (id, type, x, y, width, height, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.type,
      row.x,
      row.y,
      row.width,
      row.height,
      row.meta,
      row.createdAt,
      row.updatedAt,
    );
  }

  execBudgetMonthUpsert(id: string, buffered: number) {
    this.access.exec(
      `INSERT OR REPLACE INTO budget_months (id, buffered, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      id,
      buffered,
      nowIso(),
      nowIso(),
    );
  }

  execSettingUpsert(row: Setting) {
    this.access.exec(
      `INSERT OR REPLACE INTO settings (id, key, value, updated_at) VALUES (?, ?, ?, ?)`,
      row.id,
      row.key,
      row.value,
      row.updatedAt,
    );
  }
}
