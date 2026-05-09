/**
 * Event Store — persists events and applies them to materialized state.
 * Pattern: event sourcing with snapshot-based materialized views.
 */
import * as schema from "../db/schema";
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
  Budget,
  BudgetMonth,
} from "../db/schema";
import type {
  SyncEventPayloadMap,
  SyncEventType,
  SyncServerEvent,
  SyncSnapshot,
} from "../domain/events";
import type { DataAccess } from "./data-access";
import { json, boolToSql, DATA_TABLES, type DataTableName } from "./sync-utils";
import { createId, nowIso } from "../domain/types";

export class EventStore {
  constructor(private readonly access: DataAccess) {}

  insertEvent<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ): SyncServerEvent<T> {
    const eventId = createId("evt");
    const createdAt = nowIso();
    const row = this.access.db
      .insert(schema.events)
      .values({
        eventId,
        opId,
        type: eventType,
        payloadJson: json(payload),
        createdAt,
      })
      .returning({ seq: schema.events.seq })
      .get();
    const serverSeq = Number(row?.seq ?? 0);
    this.applyEventToMaterializedState({ eventType, payload } as any);
    return {
      type: "event",
      serverSeq,
      eventId,
      eventType,
      payload,
      causedByOpId: opId,
    } as SyncServerEvent<T>;
  }

  async appendEvent<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ) {
    return this.access.db.transaction(() => this.insertEvent(opId, eventType, payload));
  }

  replaceSnapshot(snapshot: SyncSnapshot) {
    this.access.db.transaction(() => {
      for (const tableName of DATA_TABLES) {
        this.access.exec(`DELETE FROM ${tableName}`);
      }
      const tables = (snapshot.tables ?? {}) as Record<string, Record<string, any> | undefined>;
      for (const row of Object.values<Account>(tables.accounts ?? {})) {
        this.applyEventToMaterializedState({ eventType: "account_created", payload: { row } });
      }
      for (const row of Object.values<Transaction>(tables.transactions ?? {})) {
        this.applyEventToMaterializedState({ eventType: "transaction_created", payload: { row } });
      }
      for (const row of Object.values<Category>(tables.categories ?? {})) {
        this.applyEventToMaterializedState({ eventType: "category_created", payload: { row } });
      }
      for (const row of Object.values<CategoryGroup>(tables.category_groups ?? {})) {
        this.applyEventToMaterializedState({
          eventType: "category_group_created",
          payload: { row },
        });
      }
      for (const row of Object.values<Payee>(tables.payees ?? {})) {
        this.applyEventToMaterializedState({ eventType: "payee_created", payload: { row } });
      }
      for (const row of Object.values<Schedule>(tables.schedules ?? {})) {
        this.applyEventToMaterializedState({ eventType: "schedule_created", payload: { row } });
      }
      for (const row of Object.values<Rule>(tables.rules ?? {})) {
        this.applyEventToMaterializedState({ eventType: "rule_created", payload: { row } });
      }
      for (const row of Object.values<Tag>(tables.tags ?? {})) {
        this.applyEventToMaterializedState({ eventType: "tag_created", payload: { row } });
      }
      for (const row of Object.values<Budget>(tables.budgets ?? {})) {
        this.applyEventToMaterializedState({
          eventType: "category_budget_set",
          payload: {
            month: row.month,
            categoryId: row.categoryId,
            amount: row.amount,
            carryover: row.carryover,
          },
        });
      }
      for (const row of Object.values<BudgetMonth>(tables.budget_months ?? {})) {
        this.execBudgetMonthUpsert(row.id, row.buffered);
      }
      for (const row of Object.values<CustomReport>(tables.custom_reports ?? {})) {
        this.applyEventToMaterializedState({ eventType: "report_created", payload: { row } });
      }
      for (const row of Object.values<DashboardWidget>(tables.dashboard_widgets ?? {})) {
        this.execDashboardWidgetUpsert(row);
      }
    });
  }

  private applyEventToMaterializedState(input: { eventType: string; payload: any }) {
    const { eventType, payload } = input;
    switch (eventType) {
      case "account_created":
      case "account_updated": {
        const row = payload.row as Account;
        this.execAccountUpsert(row);
        break;
      }
      case "account_closed": {
        const existing = this.access.getAccount(payload.id);
        if (existing) {
          this.execAccountUpsert({
            ...existing,
            closed: true,
            updatedAt: payload.closedAt,
          } as Account);
        }
        break;
      }
      case "transaction_created":
      case "transaction_updated": {
        const row = payload.row as Transaction;
        this.execTransactionUpsert(row);
        break;
      }
      case "transaction_deleted": {
        this.access.exec(`DELETE FROM transactions WHERE id = ?`, payload.id);
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
      case "payee_created":
      case "payee_updated": {
        const row = payload.row as Payee;
        this.execPayeeUpsert(row);
        break;
      }
      case "payees_merged": {
        // Delete source payees; target already updated
        for (const sourceId of payload.sourceIds) {
          this.access.exec(
            `UPDATE transactions SET payee = NULL WHERE payee = (SELECT name FROM payees WHERE id = ?)`,
            sourceId,
          );
          this.access.exec(`DELETE FROM payees WHERE id = ?`, sourceId);
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
        this.access.exec(`DELETE FROM schedules WHERE id = ?`, payload.id);
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
        this.access.exec(`DELETE FROM tags WHERE id = ?`, payload.id);
        break;
      }
      case "report_created":
      case "report_updated": {
        const row = payload.row as CustomReport;
        this.execReportUpsert(row);
        break;
      }
      case "dashboard_updated": {
        this.access.exec(`DELETE FROM dashboard_widgets`);
        for (const widget of payload.widgets) {
          this.execDashboardWidgetUpsert(widget);
        }
        break;
      }
      case "exchange_rate_updated": {
        this.access.exec(
          `INSERT OR REPLACE INTO exchange_rates (id, usd_to_idr, updated_at) VALUES (?, ?, ?)`,
          "latest",
          payload.usdToIdr,
          payload.updatedAt,
        );
        break;
      }
      case "category_budget_set": {
        const id = `${payload.month}-${payload.categoryId}`;
        this.access.exec(
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
        this.execBudgetMonthUpsert(monthKey, payload.buffered);
        break;
      }
      case "server_state_rebased": {
        this.replaceSnapshot(payload.snapshot);
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Raw SQL upsert helpers
  // -----------------------------------------------------------------------

  private execAccountUpsert(row: Account) {
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

  private execTransactionUpsert(row: Transaction) {
    this.access.exec(
      `INSERT OR REPLACE INTO transactions (id, account_id, category_id, amount, payee, notes, date, cleared, imported_description, starting_balance_flag, sort_order, is_parent, is_child, parent_id, transfer_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      row.createdAt,
      row.updatedAt,
    );
  }

  private execCategoryUpsert(row: Category) {
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

  private execCategoryGroupUpsert(row: CategoryGroup) {
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

  private execPayeeUpsert(row: Payee) {
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

  private execScheduleUpsert(row: Schedule) {
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

  private execRuleUpsert(row: Rule) {
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

  private execTagUpsert(row: Tag) {
    this.access.exec(
      `INSERT OR REPLACE INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)`,
      row.id,
      row.name,
      row.color,
      row.createdAt,
    );
  }

  private execReportUpsert(row: CustomReport) {
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

  private execDashboardWidgetUpsert(row: DashboardWidget) {
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

  private execBudgetMonthUpsert(id: string, buffered: number) {
    this.access.exec(
      `INSERT OR REPLACE INTO budget_months (id, buffered, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      id,
      buffered,
      nowIso(),
      nowIso(),
    );
  }
}
