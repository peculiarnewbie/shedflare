# Plan: Replace `@shedflare/money` with Full Actual Budget Engine

**Status:** Design finalized — ready for implementation
**Reference:** [Actual Budget](https://github.com/actualbudget/actual) — MIT-licensed personal finance app
**Stack:** SolidJS, TanStack DB, Durable Objects + SQLite, Effect/Schema, Drizzle ORM, Cloudflare Workers
**Target:** A full envelope-budgeting personal finance app on the shedflare Cloudflare stack.

---

## Table of Contents

1. [Why Replace Money?](#1-why-replace-money)
2. [What We Keep from Money](#2-what-we-keep-from-money)
3. [What We Port from Actual Budget](#3-what-we-port-from-actual-budget)
4. [Architecture Overview](#4-architecture-overview)
5. [Database Schema](#5-database-schema)
6. [Sync Protocol](#6-sync-protocol)
7. [Domain Events & Commands](#7-domain-events--commands)
8. [Budget Engine](#8-budget-engine)
9. [Data Import](#9-data-import)
10. [UI Screens](#10-ui-screens)
11. [Phased Rollout](#11-phased-rollout)
12. [CLI & Deployment](#12-cli--deployment)
13. [Testing Strategy](#13-testing-strategy)
14. [Appendix: Ref to Actual Repo](#14-appendix-ref-to-actual-repo)

---

## 1. Why Replace Money?

The current `@shedflare/money` is a **simple monthly ledger** — recurring templates, manual entries, USD/IDR conversion. It works for basic tracking but lacks:

- **Envelope budgeting** — assign money to categories, track leftover, carryover
- **Multi-account management** — checking, savings, credit cards, off-budget accounts
- **Transaction management** — inline editing, splitting, transfers, reconciliation
- **Schedules** — recurring transactions with smart matching
- **Rules engine** — auto-categorization on import
- **Reports** — net worth, cash flow, spending by category, budget vs actuals
- **Import** — CSV from bank downloads
- **Tags** — additional categorization
- **Goal tracking** — "save $500 by December" templates
- **Multi-device sync** — via Durable Objects + WebSocket

Actual Budget has all of this in an MIT-licensed codebase. We port the business logic while rebuilding on the shedflare stack.

## 2. What We Keep from Money

| Feature                    | Keep?   | Notes                                                                                      |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| **USD/IDR dual currency**  | ✅ Yes  | Add to the currency system (Actual already supports 46 currencies + custom number formats) |
| **Exchange rate config**   | ✅ Yes  | Keep as a user setting                                                                     |
| **Monthly navigation**     | ✅ Yes  | Actual works per-month too                                                                 |
| **CSS variable pattern**   | ✅ Yes  | Reuse existing styling patterns                                                            |
| **Auth (@shedflare/auth)** | ✅ Yes  | Already shared across shedflare apps                                                       |
| **D1 database**            | ❌ Drop | Fresh start with **Durable Objects SQLite** — blow up old schema                           |
| **Simple REST API**        | ❌ Drop | Replace with **WebSocket sync + command/event protocol**                                   |
| **Cents-based amounts**    | ✅ Yes  | Actual already uses integer amounts for precision                                          |
| **Old money data**         | ❌ Drop | Greenfield — no migration from old D1 schema. Manual re-entry or CSV import                |

## 3. What We Port from Actual Budget

**Source:** `/home/bolt/git/other/actual/` (the Actual Budget monorepo)

### Core Business Logic (port, not rewrite)

| Module                 | Source Path                                                       | Effort   | Complexity                              |
| ---------------------- | ----------------------------------------------------------------- | -------- | --------------------------------------- |
| Envelope budget engine | `packages/loot-core/src/server/budget/envelope.ts`                | 3-5 days | High — spreadsheet-based reactive cells |
| Tracking budget engine | `packages/loot-core/src/server/budget/tracking.ts`                | 1-2 days | Medium — simpler than envelope          |
| Budget actions         | `packages/loot-core/src/server/budget/actions.ts`                 | 2 days   | Medium — copy/set/average/cover         |
| Goal templates         | `packages/loot-core/src/server/budget/goal-template.ts`           | 2 days   | Medium — template DSL parser            |
| Schedule logic         | `packages/loot-core/src/server/schedules/app.ts`                  | 1 day    | Low — mostly CRUD + rschedule           |
| Transaction rules      | `packages/loot-core/src/server/rules/*.ts`                        | 2 days   | Medium — condition/action engine        |
| CSV import parser      | `packages/loot-core/src/server/transactions/import/parse-file.ts` | 0.5 day  | Low — pure JS, no platform deps         |
| Transaction merge      | `packages/loot-core/src/server/transactions/merge.ts`             | 1 day    | Medium                                  |
| Transaction transfer   | `packages/loot-core/src/server/transactions/transfer.ts`          | 0.5 day  | Low                                     |
| Account sync (no bank) | `packages/loot-core/src/server/accounts/sync.ts`                  | 1 day    | Medium — reconcile logic                |
| Date/months utilities  | `packages/loot-core/src/shared/months.ts`                         | 0.5 day  | Low — pure utilities                    |
| Currency formatting    | `packages/loot-core/src/shared/currencies.ts`                     | 0.5 day  | Low — data only                         |
| Reports data           | `packages/loot-core/src/server/reports/app.ts`                    | 2 days   | Medium — custom report builder          |
| Dashboard data         | `packages/loot-core/src/server/dashboard/app.ts`                  | 1 day    | Medium — widget data                    |
| Notes                  | `packages/loot-core/src/server/notes/app.ts`                      | 0.5 day  | Low                                     |

### What We DO NOT Port

| Feature                                                   | Reason                                                   |
| --------------------------------------------------------- | -------------------------------------------------------- |
| **CRDT sync** (`@actual-app/crdt`)                        | Replace with DO + WebSocket command/event protocol       |
| **Sync server** (Express + better-sqlite3)                | Replace with Cloudflare Durable Objects                  |
| **Bank sync providers** (GoCardless, SimpleFin, PluggyAI) | No equivalent for Indonesia                              |
| **OFX/QFX import**                                        | Desktop formats, not relevant for Indonesian web banking |
| **QIF import**                                            | Legacy Quicken format                                    |
| **Electron desktop**                                      | Web-only PWA                                             |
| **`better-sqlite3`**                                      | Replace with DO SQLite via Drizzle                       |
| **Spreadsheet reactive engine**                           | Replace with SQL computed queries broadcast as events    |
| **Redux**                                                 | Replace with TanStack DB collections                     |
| **React**                                                 | Replace with SolidJS                                     |

## 4. Architecture Overview

### Design Decisions

| Decision              | Value                                                       |
| --------------------- | ----------------------------------------------------------- |
| **Database**          | Durable Objects SQLite (`drizzle-orm/durable-sqlite`)       |
| **Schema validation** | `effect/Schema` (not Valibot) for all domain types          |
| **Sync**              | Money-specific WebSocket + command/event protocol           |
| **State management**  | TanStack DB (client) + DO (server)                          |
| **DO naming**         | `MoneyBudgetDO` — fixed name, owner-only deployment         |
| **Offline cache**     | IndexedDB snapshot (pattern inspired by chat app)           |
| **Multi-user**        | No — owner-only, like the rest of shedflare                 |
| **R2 bucket**         | `shedflare-money-uploads` — money-specific for import files |

### Stack Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Cloudflare                                   │
│                                                                       │
│  ┌────────────────────────────────┐                                  │
│  │  Pages: SolidJS SPA             │                                  │
│  │  - TanStack DB (reactive state) │                                  │
│  │  - Offline cache (IndexedDB)    │                                  │
│  │  - Optimistic pending ops       │                                  │
│  │  - WebSocket to DO              │                                  │
│  │  - D3-based chart components    │                                  │
│  └──────────┬─────────────────────┘                                  │
│             │ WebSocket (persistent)                                  │
│             ▼                                                         │
│  ┌────────────────────────────────┐                                  │
│  │  Worker: API Gateway + Auth     │                                  │
│  │  - Routes /api/sync → DO       │                                  │
│  │  - Routes /api/import → DO     │                                  │
│  │  - Routes /api/upload → R2     │                                  │
│  │  - Serves static assets (Pages) │                                  │
│  └──────────┬─────────────────────┘                                  │
│             │ internal routing                                        │
│             ▼                                                         │
│  ┌────────────────────────────────┐                                  │
│  │  MoneyBudgetDO (Durable Object) │                                  │
│  │  - SQLite (10GB)                │                                  │
│  │  - Command handler registry     │                                  │
│  │  - Event store (audit trail)    │                                  │
│  │  - Snapshot generation          │                                  │
│  │  - WebSocket broadcast          │                                  │
│  │  - Budget engine (SQL computed) │                                  │
│  │  - Schedule engine (cron)       │                                  │
│  └────────────────────────────────┘                                  │
│                                                                       │
│  ┌────────────────────────────────┐                                  │
│  │  R2: shedflare-money-uploads    │                                  │
│  │  - Temp CSV storage for import  │                                  │
│  │  - Budget exports, backups      │                                  │
│  └────────────────────────────────┘                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User adds transaction:
  1. Client optimistically updates TanStack DB collections
  2. Client creates PendingSyncOp, sends via WebSocket
  3. DO receives command, processes in SQLite transaction
  4. DO generates events (transaction_created, budget_recalculated)
  5. DO broadcasts events + ack to all connected clients
  6. Client applies events to TanStack DB (replaces optimistic)
  7. Client resolves pending op

Budget values are derived state:
  - Budget_calculated events carry computed values (leftover, to_budget)
  - Client stores these as cache, not source of truth
  - Client can also compute them locally for responsiveness
  - Server recomputes on every relevant mutation

Page load (offline-first):
  1. Client reads IndexedDB cache → shows data instantly
  2. Client connects WebSocket → sends hello with lastServerSeq
  3. If cursor stale → DO sends full snapshot
  4. If cursor valid → DO replays events since lastServerSeq
  5. Client applies events to TanStack DB
```

## 5. Database Schema

**Driver:** `drizzle-orm/durable-sqlite`
**Validation layer:** `effect/Schema` for domain transfer objects (not for schema defs)

### accounts

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  offbudget INTEGER DEFAULT 0,
  closed INTEGER DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0,
  balance_current INTEGER,
  balance_available INTEGER,
  balance_limit INTEGER,
  mask TEXT,
  official_name TEXT,
  last_reconciled TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### transactions

```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  category_id TEXT REFERENCES categories(id),
  amount INTEGER NOT NULL,          -- cents
  payee TEXT,
  notes TEXT,
  date TEXT NOT NULL,                -- ISO date
  cleared INTEGER DEFAULT 1,
  imported_description TEXT,
  starting_balance_flag INTEGER DEFAULT 0,
  sort_order REAL,
  is_parent INTEGER DEFAULT 0,      -- for split transactions
  is_child INTEGER DEFAULT 0,
  parent_id TEXT,                    -- references parent transaction
  transfer_id TEXT,                  -- references counterparty
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_date ON transactions(date);
```

### categories

```sql
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_income INTEGER DEFAULT 0,
  group_id TEXT REFERENCES category_groups(id),
  sort_order REAL NOT NULL DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  goal_def TEXT,          -- JSON template
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### category_groups

```sql
CREATE TABLE category_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_income INTEGER DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### budgets (per-month, per-category)

```sql
CREATE TABLE budgets (
  id TEXT PRIMARY KEY,                   -- "YYYYMM-categoryId"
  month INTEGER NOT NULL,                -- YYYYMM (e.g. 202604)
  category_id TEXT NOT NULL REFERENCES categories(id),
  amount INTEGER NOT NULL DEFAULT 0,     -- budgeted in cents
  carryover INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_budgets_month ON budgets(month);
CREATE INDEX idx_budgets_category ON budgets(category_id);
```

### budget_months (per-month metadata)

```sql
CREATE TABLE budget_months (
  id TEXT PRIMARY KEY,   -- "YYYY-MM"
  buffered INTEGER NOT NULL DEFAULT 0   -- money held for next month
);
-- to_budget and leftover are COMPUTED LIVE, not stored
```

Key design note: `to_budget` and `leftover` are **derived state** computed on-the-fly from transactions + budgets. Only stored metadata (like `buffered`) persists.

### payees

```sql
CREATE TABLE payees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transfer_account_id TEXT REFERENCES accounts(id),
  favorite INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_payees_name ON payees(name);
```

### schedules

```sql
CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  name TEXT,
  account_id TEXT REFERENCES accounts(id),
  payee_id TEXT REFERENCES payees(id),
  category_id TEXT REFERENCES categories(id),
  amount INTEGER,
  start_date TEXT,
  recurrence_rules TEXT NOT NULL,  -- JSON (rschedule config)
  active INTEGER DEFAULT 1,
  completed INTEGER DEFAULT 0,
  posts_transaction INTEGER DEFAULT 0,
  custom_upcoming_length INTEGER,
  next_date TEXT,                  -- cached next occurrence
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### rules

```sql
CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL DEFAULT 'pre',
  conditions_op TEXT NOT NULL DEFAULT 'and',
  conditions TEXT NOT NULL,   -- JSON array
  actions TEXT NOT NULL,      -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### tags

```sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE transaction_tags (
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (transaction_id, tag_id)
);
```

### custom_reports

```sql
CREATE TABLE custom_reports (
  id TEXT PRIMARY KEY,
  name TEXT,
  start_date TEXT,
  end_date TEXT,
  date_static INTEGER DEFAULT 0,
  date_range TEXT,
  mode TEXT,
  group_by TEXT,
  sort_by TEXT DEFAULT 'desc',
  interval TEXT,
  balance_type TEXT,
  show_empty INTEGER DEFAULT 0,
  show_offbudget INTEGER DEFAULT 0,
  show_hidden INTEGER DEFAULT 0,
  show_uncategorized INTEGER DEFAULT 0,
  trim_intervals INTEGER DEFAULT 0,
  include_current INTEGER DEFAULT 1,
  graph_type TEXT,
  conditions TEXT DEFAULT '[]',
  conditions_op TEXT DEFAULT 'and',
  metadata TEXT,             -- widget layout JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### dashboard_widgets

```sql
CREATE TABLE dashboard_widgets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  meta TEXT,                 -- widget-specific config JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### exchange_rates

```sql
CREATE TABLE exchange_rates (
  id TEXT PRIMARY KEY,   -- always "latest"
  usd_to_idr INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 6. Sync Protocol

The sync protocol is **money-specific** (not shared with chat). It follows the same pattern — WebSocket + command/event + snapshot — but is independently implemented for the budget domain.

### Protocol Overview

```
Client → Server (WebSocket messages):
  hello:       { type: "hello", clientId, protocolVersion, lastServerSeq, unackedOpIds }
  command:     { type: "command", opId, clientTs, commandType, payload }
  ping:        { type: "ping" }

Server → Client (WebSocket messages):
  hello_ack:   { type: "hello_ack", protocolVersion, serverTime, lastServerSeq }
  ack:         { type: "ack", opId, serverSeq, acceptedAt, commandType }
  reject:      { type: "reject", opId, reason, code, retriable }
  event:       { type: "event", serverSeq, eventId, eventType, payload, causedByOpId? }
  sync_reset:  { type: "sync_reset", reason, protocolVersion?, snapshot }
  pong:        { type: "pong", at }
```

### Client-side Files

| File                       | Purpose                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `src/lib/ws-connection.ts` | WebSocket lifecycle, envelope batching, clientId/cursor persistence |
| `src/lib/pending-ops.ts`   | Optimistic op tracking, dispatch, ack/reject resolution             |
| `src/lib/offline-cache.ts` | IndexedDB snapshot read/write for offline hydration                 |
| `src/lib/collections.ts`   | TanStack DB collection definitions for all budget tables            |
| `src/lib/sync-adapter.ts`  | Event envelope processor — maps events to collection mutations      |

### Server-side Files

| File                               | Purpose                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `src/server/sync-utils.ts`         | JSON helpers, logging, WebSocket detection             |
| `src/server/data-access.ts`        | Raw SQL queries, row inflation, snapshot builder       |
| `src/server/event-store.ts`        | Event persistence + materialized state application     |
| `src/server/budget-engine.ts`      | Computed budget derivation (leftover, to_budget, etc.) |
| `src/server/command-handlers/*.ts` | One file per domain aggregate (10 files)               |

## 7. Domain Events & Commands

All domain types use **`effect/Schema`** for validation and type generation.

### Effect/Schema Pattern

```typescript
import * as Schema from "effect/Schema";

export const CreateAccountCommand = Schema.Struct({
  name: Schema.String,
  offBudget: Schema.optional(Schema.Boolean),
  balance: Schema.optional(Schema.Number),
});
export type CreateAccountCommand = Schema.Schema.Type<typeof CreateAccountCommand>;
```

### Branded Types

```typescript
type AccountId = string & { readonly __brand: "AccountId" };
type TransactionId = string & { readonly __brand: "TransactionId" };
type CategoryId = string & { readonly __brand: "CategoryId" };
// etc.
```

### Commands (client → DO)

```typescript
type CommandMap = {
  // Accounts
  create_account: { name: string; offBudget?: boolean; balance?: number };
  update_account: { id: string; name?: string; offBudget?: boolean };
  close_account: { id: string; transferAccountId?: string };
  reopen_account: { id: string };
  reorder_accounts: { ids: string[] };

  // Transactions
  create_transaction: { row: TransactionInput };
  update_transaction: { id: string; fields: Partial<TransactionInput> };
  delete_transaction: { id: string };
  split_transaction: { parentId: string; children: TransactionInput[] };
  import_transactions: {
    accountId: string;
    transactions: ParsedTransaction[];
    isPreview?: boolean;
  };

  // Budget
  set_budget_amount: { month: number; categoryId: string; amount: number };
  set_budget_carryover: { month: number; categoryId: string; carryover: boolean };
  set_buffer: { month: string; amount: number };
  copy_previous_month: { month: string };
  set_3month_avg: { month: string };
  set_nmonth_avg: { month: string; months: number };
  set_zero: { month: string };
  apply_goal_templates: { month: string };
  cover_overspending: { month: string; from: string; to: string; amount?: number };
  transfer_budget: { month: string; from: string; to: string; amount: number };
  hold_for_next_month: { month: string; amount: number };

  // Categories
  create_category: { name: string; groupId: string; isIncome?: boolean };
  update_category: { id: string; name?: string; hidden?: boolean };
  delete_category: { id: string; transferToId?: string };
  create_category_group: { name: string; isIncome?: boolean };
  update_category_group: { id: string; name?: string; hidden?: boolean };
  reorder_categories: { ids: string[] };

  // Payees
  create_payee: { name: string };
  update_payee: { id: string; name?: string; favorite?: boolean };
  merge_payees: { targetId: string; sourceIds: string[] };

  // Schedules
  create_schedule: { schedule: ScheduleInput };
  update_schedule: { id: string; fields: Partial<ScheduleInput> };
  delete_schedule: { id: string };
  skip_schedule_date: { id: string };
  post_schedule_transaction: { scheduleId: string };

  // Rules
  create_rule: { rule: RuleInput };
  update_rule: { id: string; fields: Partial<RuleInput> };
  delete_rule: { id: string };

  // Tags
  create_tag: { name: string; color?: string };
  delete_tag: { id: string };

  // Reports
  create_report: { report: CustomReportInput };
  update_report: { id: string; fields: Partial<CustomReportInput> };
  delete_report: { id: string };

  // Dashboard
  update_dashboard: { widgets: DashboardWidget[] };

  // Currency
  set_currency: { code: string; symbol: string; decimalPlaces: number };
  update_exchange_rate: { usdToIdr: number };
};
```

### Events (DO → client)

```typescript
type EventMap = {
  // Row-level events
  account_created: { row: Account };
  account_updated: { row: Account };
  account_closed: { id: string; closedAt: string };
  transaction_created: { row: Transaction };
  transaction_updated: { row: Transaction };
  transaction_deleted: { id: string };
  transactions_imported: { accountId: string; added: number; updated: number };
  category_created: { row: Category };
  category_updated: { row: Category };
  category_group_created: { row: CategoryGroup };
  category_group_updated: { row: CategoryGroup };
  payee_created: { row: Payee };
  payee_updated: { row: Payee };
  payees_merged: { targetId: string; sourceIds: string[] };
  schedule_created: { row: Schedule };
  schedule_updated: { row: Schedule };
  schedule_deleted: { id: string };
  rule_created: { row: Rule };
  rule_updated: { row: Rule };
  tag_created: { row: Tag };
  tag_deleted: { id: string };

  // Computed value events (triggered by budget engine)
  budget_recalculated: { month: number; toBudget: number; buffered: number };
  category_leftover_changed: {
    month: number;
    categoryId: string;
    leftover: number;
    leftoverPos: number;
  };
  category_budget_set: { month: number; categoryId: string; amount: number; carryover: boolean };

  // Report/dashboard updates
  report_created: { row: CustomReport };
  report_updated: { row: CustomReport };
  dashboard_updated: { widgets: DashboardWidget[] };
};
```

## 8. Budget Engine

### Approach: SQL Computed Values (not spreadsheet engine)

Budget values are **derived state** computed from base data (transactions + budgets). No reactive spreadsheet engine is ported.

#### Core Formulas

```
leftover = budgeted + sum_amount + (carryover ? prev_leftover : max(prev_leftover, 0))
to_budget = total_income - sum(budgeted) - buffered
buffered = money held for next month
group-sum-amount = sum(child_categories.sum_amount)
group-budget = sum(child_categories.budget)
```

The `pos_leftover` (positive leftover) vs `leftover` distinction is critical:

- **`leftover`**: The actual leftover (can be negative = overspent)
- **`pos_leftover`**: `max(leftover, 0)` — used when carryover is disabled, so overspending doesn't carry forward

#### When Recalculation Happens

The budget engine recalculates on:

- Transaction created/updated/deleted (amount or category changed)
- Budget amount set/reset
- Carryover toggle changed
- Category created/deleted/moved
- Buffer amount changed

Recalculation scope:

- Affected month only (where the change occurred)
- Plus next month if carryover is involved (carryover cascades forward)
- The DO broadcasts `budget_recalculated` events to all connected clients

#### SQL Queries

```sql
-- to_budget for a month:
-- Total income (transactions in income categories) - total budgeted - buffered
SELECT
  COALESCE(income.total, 0) - COALESCE(budgeted.total, 0) - COALESCE(bm.buffered, 0) AS to_budget
FROM (
  SELECT COALESCE(SUM(t.amount), 0) AS total
  FROM transactions t
  JOIN categories c ON t.category_id = c.id
  WHERE t.date >= ? AND t.date < ? AND c.is_income = 1 AND c.hidden = 0
) income,
(
  SELECT COALESCE(SUM(b.amount), 0) AS total
  FROM budgets b
  WHERE b.month = ?
) budgeted
LEFT JOIN budget_months bm ON bm.id = ?

-- leftover per category for a month:
SELECT
  c.id,
  c.name,
  b.amount AS budget_amount,
  COALESCE(tx.sum_amount, 0) AS spent,
  (b.amount + COALESCE(tx.sum_amount, 0)) AS leftover_raw,
  CASE WHEN b.carryover = 1
    THEN COALESCE(prev.leftover, 0)
    ELSE MAX(COALESCE(prev.leftover_pos, 0), 0)
  END AS carryover_from_prev,
  (b.amount + COALESCE(tx.sum_amount, 0) +
    CASE WHEN b.carryover = 1
      THEN COALESCE(prev.leftover, 0)
      ELSE MAX(COALESCE(prev.leftover_pos, 0), 0)
    END
  ) AS leftover
FROM categories c
LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ?
LEFT JOIN (
  SELECT category_id, SUM(amount) AS sum_amount
  FROM transactions WHERE date >= ? AND date < ?
  GROUP BY category_id
) tx ON tx.category_id = c.id
LEFT JOIN (
  SELECT category_id, leftover, leftover_pos
  FROM v_month_leftover WHERE month = ?
) prev ON prev.category_id = c.id
WHERE c.hidden = 0
```

Where `v_month_leftover` is a computed view (not a stored table) that can be materialized per-request.

### Both Budget Types Supported

1. **Envelope budget** (default — recommended for most users)
   - Assign available money to categories
   - Track leftovers (can be overspent, carry over)
   - Hold money for next month

2. **Tracking budget** (alternative — simpler)
   - Set spending targets per category
   - Track actual vs. budgeted
   - No envelope mechanics (no "available money" tracking)
   - User-selectable in Settings

### Goal Templates

Port Actual's goal template system. Templates are stored as JSON in `categories.goal_def` and parsed by the goal template engine. Examples:

```json
// "Save $500 by December 2026"
{ "type": "byDate", "amount": 50000, "targetDate": "2026-12" }

// "Spend up to $200/month"
{ "type": "monthly", "amount": 20000 }
```

The `apply_goal_templates` command runs the parser and sets budget amounts accordingly.

## 9. Data Import

### Import Sources (v1)

| Source                   | Support         | Reason                                     |
| ------------------------ | --------------- | ------------------------------------------ |
| Manual entry             | ✅ Full UI      | Add transactions one-by-one                |
| CSV upload               | ✅ Full support | Bank-exported CSV files                    |
| OFX/QFX                  | ❌ Deferred     | Desktop format, not relevant for Indonesia |
| QIF                      | ❌ Deferred     | Legacy format                              |
| OCR from bank statements | ❌ Future       | Deferred to later phase                    |
| Bank sync API            | ❌ Never        | No free Indonesia aggregator               |

### Import Pipeline

```
User drags file on account page →
  Client uploads file to Worker →
  Worker stores in R2 (shedflare-money-uploads) →
  DO command: import_transactions →
    Download file from R2 →
    Parse CSV (ported from Actual) →
    Run rules engine (auto-categorize) →
    Match against existing transactions →
    Insert new, update matched →
    R2 cleanup →
    Return { added, updated, errors }
```

### CSV Format

The CSV parser from Actual handles:

- Configurable delimiter (`,` or `\t`)
- Header row auto-detection
- Date format auto-detection
- Amount parsing (including IN/OUT columns)
- Payee/memo field mapping
- Notes import

For Indonesian bank CSV exports (BCA, Mandiri, BRI, BNI), the user maps columns on first import. The mapping is saved in `exchange_rates` table (or a dedicated `import_profiles` table in a future version).

## 10. UI Screens

### Layout

```
┌──────────────┬──────────────────────────────────────────┐
│   Sidebar    │                                           │
│   ────────   │            Main Content                   │
│   Dashboard  │                                           │
│   Budget     │                                           │
│   Accounts   │                                           │
│   Reports    │                                           │
│   Schedules  │                                           │
│   Payees     │                                           │
│   Rules      │                                           │
│   Tags       │                                           │
│   Settings   │                                           │
│              │                                           │
│   ────────   │                                           │
│   [Sign Out] │                                           │
└──────────────┴──────────────────────────────────────────┘
     Mobile:
     ┌──────────────────────────────────────────┐
     │ Top Bar (title + month nav + currency)   │
     ├──────────────────────────────────────────┤
     │            Main Content                   │
     │                                           │
     ├──────────────────────────────────────────┤
     │ [Dash][Budg][Accnt][Rprts][More▸]        │
     └──────────────────────────────────────────┘
```

Desktop: sidebar navigation. Mobile: bottom tab bar (5 tabs + overflow menu).

### Navigation Structure

```
/                       Dashboard — net worth, cash flow, budget health
/budget                 Budget month grid
/accounts               Account list with balances
/accounts/:id           Account detail + transaction table
/reports                Report dashboard (configurable widgets)
  /reports/net-worth     Net worth over time (area chart)
  /reports/cash-flow     Income vs expenses (bar chart)
  /reports/spending      Spending by category (donut chart)
  /reports/budget        Budget vs actuals
  /reports/age-of-money  Days your money lasts
/schedules              Recurring transaction templates
  /schedules/:id         Edit schedule
/payees                 Manage and merge payees
/rules                  Auto-categorization rules
/tags                   Manage tags
/settings               Currency, budget type, export, number format
```

### Chart Library

Custom SolidJS chart components built on top of D3, rather than using Chart.js. This gives:

- Full control over rendering and animation
- Tighter integration with SolidJS reactive system
- Smaller bundle (D3 is modular, can tree-shake)
- Consistent look with the app's design system

Charts for v1:

- **AreaChart** — Net worth over time
- **BarChart** — Cash flow (income vs expenses by month)
- **DonutChart** — Spending breakdown by category
- **BudgetBar** — Budget vs actuals per category

### Key UI Components

| Component           | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `BudgetTable`       | Month grid: category rows × budgeted/spent/leftover columns |
| `BudgetCell`        | Inline-editable budget amount input                         |
| `BalanceCell`       | Shows leftover or overspent amount with color coding        |
| `TransactionsTable` | Filterable, sortable transaction list with inline editing   |
| `AccountPage`       | Account header (balance, reconciliation) + transaction list |
| `ScheduleForm`      | Recurrence rule editor using rschedule                      |
| `RuleEditor`        | Condition/action builder (drag-and-drop rules)              |
| `ManageRules`       | List view of all rules with enable/disable                  |
| `CategorySelector`  | Category dropdown with groups                               |
| `PayeeAutocomplete` | Type-ahead payee search + quick-add                         |
| `AmountInput`       | Currency-aware amount field (handles cents)                 |
| `ImportModal`       | Drag-and-drop CSV upload with column mapping preview        |
| `Modal`             | Reusable modal component (the current app pattern)          |

## 11. Phased Rollout

### Phase 1: Infrastructure + Data Model (Week 1)

- [ ] Define all Drizzle schema tables with proper indexes
- [ ] Write domain types using Effect/Schema (commands, events, row types)
- [ ] Create `MoneyBudgetDO` class with command/event infrastructure
- [ ] Implement WebSocket lifecycle (hello, ping/pong, reconnect)
- [ ] Implement event store + materialized state
- [ ] Wire up TanStack DB collections + sync adapter
- [ ] Implement IndexedDB offline cache
- [ ] Add money app to CLI manifests + base config
- [ ] **Deliverable:** Connect to DO, see empty budget, sync works

### Phase 2: Accounts + Transactions CRUD (Week 2)

- [ ] Account command handlers (create, update, close, reopen, reorder)
- [ ] Transaction command handlers (create, update, delete, split)
- [ ] Account list page (sidebar + mobile)
- [ ] Account detail page with transaction table
- [ ] TransactionRow component with inline editing
- [ ] Date picker, amount input, payee autocomplete
- [ ] Category selector
- [ ] **Deliverable:** Can add accounts, import transactions, edit them

### Phase 3: Budget Engine (Weeks 3-4)

- [ ] Implement SQL-based budget computation queries
- [ ] Budget month grid: categories, budgeted, spent, leftover
- [ ] Budget actions: set amount, cover overspending, transfer, hold
- [ ] Carryover per category (leftover vs pos_leftover)
- [ ] Copy previous month, set 3-month average, zero out
- [ ] Apply goal templates
- [ ] Buffered money (hold for next month)
- [ ] Both envelope and tracking budget modes
- [ ] **Deliverable:** Full envelope budgeting works

### Phase 4: Rules + Schedules + Tags (Week 5)

- [ ] Port rules engine (conditions + actions) from Actual
- [ ] Rules UI: condition builder, action list, enable/disable
- [ ] Auto-categorization on import
- [ ] Port schedule engine (recurrence logic) from Actual
- [ ] Schedule UI: create from transaction, recurring rules, upcoming list
- [ ] Tags: create, assign to transactions, filter
- [ ] Payee management page: list, rename, merge duplicates
- [ ] **Deliverable:** Automation features work

### Phase 5: Reports + Dashboard (Week 6)

- [ ] D3-based chart components (AreaChart, BarChart, DonutChart)
- [ ] Net worth chart (account balances over time)
- [ ] Cash flow chart (income vs expenses)
- [ ] Spending breakdown by category
- [ ] Budget analysis (budget vs actuals)
- [ ] Age of money calculation
- [ ] Configurable dashboard widgets
- [ ] Custom report builder
- [ ] **Deliverable:** Full reporting suite

### Phase 6: Settings + Polish (Week 7)

- [ ] Currency settings (46 currencies from Actual)
- [ ] Number format settings
- [ ] Budget type toggle (envelope vs tracking)
- [ ] Exchange rate editor
- [ ] Data export (CSV)
- [ ] Goal templates UI
- [ ] Reconciliation workflow
- [ ] CSV import with column mapping UI
- [ ] R2 upload for import files
- [ ] **Deliverable:** Feature-complete

### Phase 7: Tests + Hardening (Week 8)

- [ ] Port Actual Budget's MIT-licensed tests for:
  - Budget engine calculations (envelope + tracking)
  - Rules engine (condition matching + action application)
  - Transaction merge logic
- [ ] End-to-end smoke test: deploy, create accounts, add transactions, verify budget
- [ ] `shedflare doctor` check for DO health + schema
- [ ] CI pipeline: `shedflare init --yes --mock-resources` in temp dir
- [ ] **Deliverable:** Production-ready deployment

## 12. CLI & Deployment

### Manifest Changes

Add `"money"` to the `AppId` type union in `packages/cli/src/core/manifests.ts`:

```typescript
export type AppId = "auth" | "chat" | "drive" | "money";
```

Add builtin manifest in `manifests-data.ts`:

```typescript
money: {
  id: "money",
  name: "Shedflare Money",
  description: "Envelope-budgeting personal finance app",
  dependsOn: ["auth"],
  defaultSubdomain: "money",
  vars: {
    APP_PUBLIC_URL: { from: "appUrl", description: "Public URL" },
    AUTH_ISSUER_URL: { from: "appUrl", app: "auth", description: "Auth issuer URL" },
    AUTH_CLIENT_ID: { from: "appId", description: "OAuth client ID" },
    OWNER_EMAIL: { from: "ownerEmail", description: "Deployment owner email" },
  },
  secrets: {},
  resources: [
    { type: "durable_object", binding: "BUDGET_DO" },
    { type: "r2", binding: "UPLOADS", name: "shedflare-money-uploads" },
  ],
}
```

### Base Wrangler Config

Add to `templates-data.ts`:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "shedflare-money",
  "main": "src/worker.ts",
  "compatibility_date": "2026-03-22",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  },
  "assets": {
    "directory": "dist/client",
    "binding": "ASSETS",
    "html_handling": "none",
    "not_found_handling": "none"
  },
  "durable_objects": {
    "bindings": [{ "name": "BUDGET_DO", "class_name": "MoneyBudgetDO" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["MoneyBudgetDO"] }],
  "r2_buckets": [{ "binding": "UPLOADS" }]
}
```

### Provisioning

The CLI's `provision.ts` already handles:

- `durable_object` — no-op (DOs are code-defined, not provisioned via API)
- `r2` — creates bucket via `wrangler r2 bucket create`

### Doctor Check

Add a `shedflare doctor` check that:

1. Sends a ping to the DO via WebSocket
2. Verifies a pong response
3. Checks the DO's event store is operating (get lastServerSeq)
4. Reports schema version

## 13. Testing Strategy

### Sources of Tests

Actual Budget has MIT-licensed tests in `packages/loot-core/src/`:

| Test Suite        | Path                                  | Priority                |
| ----------------- | ------------------------------------- | ----------------------- |
| Budget envelope   | `server/budget/*.test.ts`             | High — core logic       |
| Rules engine      | `server/rules/*.test.ts`              | Medium                  |
| Transaction merge | `server/transactions/merge.test.ts`   | Medium                  |
| Schedules         | `server/schedules/*.test.ts`          | Low — mostly CRUD       |
| Goal templates    | `server/budget/goal-template.test.ts` | Low — parser is pure JS |

### Porting Approach

1. **Copy pure computation tests verbatim** — Tests for CSV parser, month utils, currency formatting are pure JS with no platform deps. They run in Vitest directly.

2. **Adapt budget engine tests** — Actual's budget tests use `better-sqlite3` and the spreadsheet engine. We rewrite these to use our SQL computed queries and `drizzle-orm/durable-sqlite` memory driver.

3. **Write new tests for DO command handlers** — Each command handler gets a test that:
   - Creates a DO-like in-memory SQLite database
   - Registers command handlers
   - Sends a command
   - Asserts the resulting events
   - Asserts the materialized state

### Test Runner

Use Vitest (already in the workspace). Tests that need DO SQLite use `durable-sqlite`'s in-memory mode:

```typescript
import { drizzle } from "drizzle-orm/durable-sqlite";

// Mock DO storage with in-memory SQLite
const mockStorage = createMockDurableStorage();
const db = drizzle(mockStorage, { schema });
```

Tests without platform deps run as normal Vitest tests.

## 14. Appendix: Ref to Actual Repo

### Key Source Files in Actual Budget

| What                   | Path in Actual                                                    | License |
| ---------------------- | ----------------------------------------------------------------- | ------- |
| Envelope budget        | `packages/loot-core/src/server/budget/envelope.ts`                | MIT     |
| Tracking budget        | `packages/loot-core/src/server/budget/tracking.ts`                | MIT     |
| Budget actions         | `packages/loot-core/src/server/budget/actions.ts`                 | MIT     |
| Budget base            | `packages/loot-core/src/server/budget/base.ts`                    | MIT     |
| Goal templates         | `packages/loot-core/src/server/budget/goal-template.ts`           | MIT     |
| Goal template parser   | `packages/loot-core/src/server/budget/goal-template.pegjs`        | MIT     |
| Schedules              | `packages/loot-core/src/server/schedules/app.ts`                  | MIT     |
| Rules engine           | `packages/loot-core/src/server/rules/*.ts`                        | MIT     |
| Rules condition parser | `packages/loot-core/src/server/rules/condition.ts`                | MIT     |
| Rules action parser    | `packages/loot-core/src/server/rules/action.ts`                   | MIT     |
| CSV import             | `packages/loot-core/src/server/transactions/import/parse-file.ts` | MIT     |
| Transaction merge      | `packages/loot-core/src/server/transactions/merge.ts`             | MIT     |
| Transaction transfer   | `packages/loot-core/src/server/transactions/transfer.ts`          | MIT     |
| Reports                | `packages/loot-core/src/server/reports/app.ts`                    | MIT     |
| Dashboard              | `packages/loot-core/src/server/dashboard/app.ts`                  | MIT     |
| Account management     | `packages/loot-core/src/server/accounts/app.ts`                   | MIT     |
| Payee management       | `packages/loot-core/src/server/payees/app.ts`                     | MIT     |
| Tags                   | `packages/loot-core/src/server/tags/app.ts`                       | MIT     |
| Currency data          | `packages/loot-core/src/shared/currencies.ts`                     | MIT     |
| Month utils            | `packages/loot-core/src/shared/months.ts`                         | MIT     |
| Notes                  | `packages/loot-core/src/server/notes/app.ts`                      | MIT     |
| DB schema              | `packages/loot-core/src/server/sql/init.sql`                      | MIT     |
| Filters                | `packages/loot-core/src/server/filters/app.ts`                    | MIT     |
| Budget tests           | `packages/loot-core/src/server/budget/*.test.ts`                  | MIT     |
| Rules tests            | `packages/loot-core/src/server/rules/*.test.ts`                   | MIT     |

### What We Copy vs. What We Port

- **Copy verbatim (pure JS/TS, no platform deps):** CSV parser, month utils, currency data, transaction merge logic, transaction transfer logic, goal template parser, rules condition parser, rules action parser
- **Port with adaptations:** Envelope/tracking budget engine (to SQL computed queries), rules engine (Effect errors), schedule engine
- **Rewrite for SolidJS + D3:** All React UI components, chart components
- **Skip entirely:** CRDT sync, Express server, better-sqlite3, bank sync providers, OFX/QIF, Electron, Redux, spreadsheet engine

### Notes on License

Actual Budget is **MIT licensed**. All ported code retains the MIT license. We must include the copyright notice in any file that contains substantial ported code. Add to the header:

```typescript
/**
 * Ported from Actual Budget (MIT)
 * https://github.com/actualbudget/actual
 * Original copyright: James Long and contributors
 */
```

---

## Completed Tasks

### Session: 2026-05-13 — Rule Test UI + Schedule Detail Page

| Task | Status | Details |
| ---- | ------ | ------- |
| `/api/transactions` endpoint | ✅ | Returns all transactions across accounts with category/account names |
| Rule Test UI | ✅ | "Test" button on rule cards opens modal that loads all transactions and runs rule conditions against them, showing matching results in a table |
| Schedule detail page (`/schedules/:id`) | ✅ | Dedicated route with read-only detail view, inline edit form, Post/Skip/Delete actions |

---

## Quick Start (for implementer)

```bash
# 1. Install deps
pnpm add @tanstack/db @tanstack/solid-db drizzle-orm effect
pnpm add -D wrangler drizzle-kit vitest

# 2. Write Drizzle schema
# (src/db/schema.ts)

# 3. Write domain types with Effect/Schema
# (src/domain/{types,commands,events,factories}.ts)

# 4. Write sync infrastructure
# (src/lib/*.ts, src/server/*.ts)

# 5. Write command handlers
# (src/server/command-handlers/*.ts)

# 6. Write UI
# (src/routes/*.tsx, src/components/*.tsx)

# 7. Register in CLI
# (packages/cli/src/core/manifests.ts + manifests-data.ts + templates-data.ts)

# 8. Deploy
pnpm deploy:money
```
