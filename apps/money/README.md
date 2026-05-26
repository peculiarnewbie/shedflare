# Shedflare Money

Envelope-budgeting personal finance app — self-hosted, single-user, web-only.

Built on Cloudflare Durable Objects + SQLite with real-time WebSocket sync, offline-first IndexedDB cache, and a SolidJS SPA frontend.

---

## What It Is

Shedflare Money is a zero-based budgeting (envelope budgeting) app for personal use. You assign every dollar of income to a category, track spending against those budgets, and see where your money goes.

**Designed for:** single users who want full control over their finances without cloud dependencies or multi-user complexity.

---

## Features

### Budgeting

- **Envelope budgeting** — assign income to categories, track leftover, carryover between months
- **Buffer** — hold money aside for next month
- **Budget actions** — cover overspending, transfer between categories, copy previous month, set averages (3-month, N-month), zero out, goal templates
- **5 goal template types** — monthly (fixed amount), byDate (save by deadline), refill (maintain target balance), periodic (every N months), percentage (% of monthly income)
- **Budgeted minus spending = leftover** (computed live via SQL queries, not stored)

### Accounts & Transactions

- **Multi-account support** — checking, savings, credit cards, off-budget accounts
- **Transaction CRUD** — create, update, delete, split transactions
- **Reconciliation** — compare statement balance against app balance, mark cleared/adjusted
- **Tags** — create tags, assign to transactions, color-coded
- **Payees** — manage payees, merge duplicates, favorites, autocomplete
- **Transaction filters** — save searches with condition builder, server-side SQL execution

### Automation

- **Schedules** — recurring transaction templates with configurable frequency, weekend handling (skip before/after), end conditions (after N occurrences or on a date)
- **Schedule discovery** — analyze transaction history to detect recurring patterns, suggest schedules with confidence scores
- **Rules engine** — auto-categorize transactions on import with conditions (payee, amount, date, notes, account, cleared + 12 comparison operators) and actions (set category/payee/notes, prepend/append notes, delete transaction, link schedule)
- **Rule test UI** — preview which existing transactions would match a rule
- **CSV import** — upload CSV files, parse, run rules, insert/update transactions

### Reporting & Dashboard

- **Dynamic dashboard** — 10 configurable widget types on a resizable grid:
  - Summary card (individual stat cards)
  - Overview summary (4 stats in one row)
  - Net worth over time (area chart)
  - Cash flow (bar chart)
  - Spending by category (donut chart)
  - Budget analysis (bar chart)
  - Age of money (days metric)
  - Calendar heatmap (daily spending intensity)
  - FI-RE crossover projection (4% rule)
  - Markdown notes
- **Built-in reports** — net worth history, cash flow, spending breakdown, budget analysis, age of money, calendar heatmap, FI-RE projection
- **Custom reports** — save reports with filter conditions, grouping, sorting, and graph types
- **Dashboard export/import** — JSON backup of widget layouts

### Sync & Offline

- **WebSocket sync** — real-time events between server and all connected clients
- **Snapshot + replay** — on reconnect, get full snapshot or replay missed events
- **Offline cache** — IndexedDB fallback, pending ops queue, disconnect/reconnect banners
- **Optimistic UI** — changes show immediately, resolve on server ack or reject

### Settings

- **Currency** — USD and IDR with configurable exchange rate
- **Number format** — comma-dot (1,234.56), dot-comma (1.234,56), space-dot (1 234.56)
- **Date format** — ISO (YYYY-MM-DD), US (MM/DD/YYYY), EU (DD.MM.YYYY)
- **First day of week** — Sunday or Monday (affects calendar heatmap)
- **Privacy mode** — blur all monetary amounts with CSS filter
- **Export** — CSV export of all transactions, JSON export of dashboard

### UI

- **Command palette** — Cmd+K to fuzzy-search pages, accounts, payees, categories, schedules
- **Offline indicator** — sticky banner on disconnect with reconnect attempt count
- **PageState component** — consistent loading spinners and error retry across all pages
- **Dark theme only**

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Cloudflare Durable Object (MoneyBudgetDO)          │
│  - SQLite database (single instance)                │
│  - 13 command handlers (49 commands)               │
│  - Event store (audit trail, sequence numbers)      │
│  - Budget engine (SQL-computed derived values)      │
│                                                     │
│  WebSocket sync (hello → ack → event)              │
│  REST API (GET endpoints for dashboard, reports)   │
└──────────┬──────────────────────────────────────────┘
           │ WebSocket
           ▼
┌─────────────────────────────────────────────────────┐
│  Cloudflare Worker (HTTP gateway + auth)            │
│  - Routes /api/* → DO                              │
│  - Routes /ws → DO                                  │
│  - Serves static assets (SolidJS SPA)              │
│                                                     │
│  Auth: OpenAuth OAuth flow with @shedflare/auth     │
└─────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  SolidJS SPA (client)                               │
│  - TanStack DB collections (reactive state)         │
│  - WebSocket sync adapter                           │
│  - IndexedDB offline cache                          │
│  - Undo/redo (keyboard: Ctrl+Z / Ctrl+Y)           │
│  - D3-based chart components                        │
└─────────────────────────────────────────────────────┘
```

### Data Flow

```
User adds transaction:
  1. Client optimistically updates TanStack DB
  2. Client creates PendingSyncOp, sends via WebSocket
  3. DO processes command in SQLite transaction
  4. DO generates events, broadcasts to all clients
  5. Client receives ack + events, resolves pending op

Page load (offline-first):
  1. Client reads IndexedDB cache → shows data instantly
  2. Connects WebSocket → sends hello with lastServerSeq
  3. If stale → DO sends full snapshot
  4. If valid → DO replays events since lastServerSeq
```

### Database Schema (32 tables)

| Table | Purpose |
|-------|---------|
| `accounts` | Checking, savings, credit cards, off-budget |
| `category_groups` | Income/expense groupings |
| `categories` | Spending categories with goal definitions |
| `transactions` | All transactions (parent/child splits, schedules) |
| `budgets` | Per-month, per-category budget amounts |
| `budget_months` | Monthly metadata (buffered money) |
| `payees` | Merchant/recipient names with favorites |
| `schedules` | Recurring transaction templates |
| `rules` | Auto-categorization (conditions + actions) |
| `tags` + `transaction_tags` | User-defined tags on transactions |
| `custom_reports` | Saved report configurations |
| `dashboard_widgets` | User's dashboard grid layout |
| `exchange_rates` | USD ↔ IDR conversion rates |
| `settings` | User preferences (format, privacy, etc.) |
| `events` | Audit trail (event sourcing) |
| `notes` | Generic key-value notes for any entity |
| `transaction_filters` | Saved search queries |
| `commands` | Idempotent command tracking |

### Command/Event Model

- **49 commands** across 13 aggregate handlers
- Commands validated via Effect/Schema
- Events persisted with sequence numbers
- Derived state (budget values) computed live via SQL queries
- Events broadcast to all connected WebSocket clients

---

## Tech Stack

- **Frontend:** SolidJS 1.9 + SolidJS Router + TanStack DB + D3
- **Backend:** Cloudflare Workers + Durable Objects + SQLite
- **Database:** Drizzle ORM (DO SQLite)
- **Validation:** Effect/Schema
- **Sync:** WebSocket with hello/ack/reject/event protocol
- **Offline:** IndexedDB cache, pending operations, offline-first SSR

---

## Design Decisions (Explicitly Out of Scope)

These are intentional boundaries — not missing features, but deliberate exclusions:

### Budget Model

- **Envelope budgeting only** — no tracking budget mode. Zero-based budgeting is the core interaction model.
- **SQL-computed derived values** — budget engine computes leftover/to_budget on the fly. No reactive spreadsheet cell graph.
- **No PEG parser for natural-language goals** — goal templates use JSON definitions with 5 fixed types (monthly, byDate, refill, periodic, percentage). No DSL parsing.
- **No AQL query language** — reports use condition JSON arrays with standard comparison operators.

### Rules & Automation

- **No formula actions** — rule actions set fixed values or note text. No balance-of queries, HyperFormula, or spreadsheet formulas.
- **No Handlebars template helpers** — rule actions are simple set/prepend/append/delete. No string interpolation with runtime variables.
- **No payee-specific learning** — rules are manually created. No auto-rule-generation from repeated user behavior.

### Data & Import

- **CSV import only** — no OFX/QFX/QIF/CAMT bank formats. No bank sync (GoCardless, SimpleFIN). Indonesian banks use CSV exports.
- **No batch operations** — single transaction commands only. No bulk insert/update/delete endpoints.
- **No data encryption** — data at rest in DO SQLite is unencrypted. No E2E encryption.
- **No backups/restore** — no backup list or restore mechanism. Users should use the CSV export and dashboard export features.

### Localization & Theming

- **English only** — no i18n framework. No language selection.
- **USD and IDR only** — no multi-currency support beyond the exchange rate toggle.
- **Dark theme only** — no light/midnight themes. No custom CSS override.
- **No theme customization** — the app has a fixed visual style.

### Multi-User & Infrastructure

- **Single-user, owner-only** — no multi-user support. The app is deployed once per user.
- **Single Durable Object** — all data lives in one `MoneyBudgetDO` instance. No sharding or multi-DO architecture.

### Future Considerations

- **LLM-based categorization** — rule engine and payee learning may be replaced or augmented by LLM-powered categorization in a future iteration. This is the planned direction for the rules and learning features.
- **Charting library project** — Sankey flow diagrams and formula cards are deferred to a separate charting library project.
