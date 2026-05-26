# Money App — Feature Gaps vs Actual Budget

Comparison target: [Actual Budget](https://actualbudget.org) — source at `/home/bolt/git/other/actual`.

**Note:** Many "gaps" below are intentional design decisions, not missing features. See the explicit "Not Doing" section at the bottom.

---

## Not Doing (Intentional Boundaries)

These are deliberate exclusions — confirmed as out of scope:

| Feature | Reason |
|---------|--------|
| AQL query language | Conditions use JSON arrays with standard operators. No DSL needed. |
| PEG parser for natural-language goals | Goal templates use JSON definitions with 5 fixed types. LLM-based approach planned for the future. |
| Spreadsheet engine (reactive cell graph) | SQL-computed derived values are sufficient. Simpler, faster, no reactive dependency graph. |
| Formula actions in rules | No HyperFormula, no balance-of queries, no spreadsheet formulas. |
| Handlebars template helpers in rules | Rule actions are simple set/prepend/append/delete. No string interpolation. |
| Payee-specific rules / learn_categories | Rules are manually created. LLM-based categorization planned for the future. |
| Multi-user | Self-hosted, single-user. Auth protects from public access only. |
| OFX/QFX/QIF/CAMT import | Indonesian banks use CSV exports. No desktop bank sync tools. |
| Bank sync (GoCardless, SimpleFIN, PluggyAI) | No free Indonesia aggregator available. |
| Tracking budget mode | Envelope budgeting is the core interaction model. |
| Desktop app | Web-only PWA. |
| CRDT conflict resolution | Event sourcing + idempotent commands handle sync without CRDTs. |
| Multi-currency (42+ currencies) | Only USD and IDR — the owner's currencies. |
| i18n / language selection | English only. |
| Light/Midnight themes | Dark theme only. |
| Custom CSS override | Fixed visual style, no theming system. |
| Backups / restore | Users use CSV export and dashboard JSON export. |
| End-to-end encryption | Data at rest in DO SQLite is unencrypted. |
| Experimental feature flags | No feature flag infrastructure. |

---

## What's Fully Implemented ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Envelope budgeting | ✅ | Full: carryover, buffer, overspending detection, transfer, cover |
| Goal templates | ✅ | 5 types: monthly, byDate, refill, periodic, percentage. UI editor on categories page |
| Budget actions | ✅ | copy_previous_month, set_3month_avg, set_nmonth_avg, set_zero, cover_overspending, transfer, hold_for_next_month |
| Multi-account management | ✅ | Create, update, close/reopen, reorder, off-budget flag |
| Transaction CRUD | ✅ | Create, update, delete, split transactions |
| Reconciliation | ✅ | Statement balance comparison, mark cleared/adjusted, creates adjustment txns |
| Tags | ✅ | Create, assign to transactions, color-coded |
| Payees | ✅ | CRUD, merge, favorites, autocomplete |
| Transaction filters | ✅ | Saved searches with condition builder, server-side SQL |
| Schedules | ✅ | Recurring templates with frequency, weekend handling, end conditions |
| Schedule discovery | ✅ | Detects recurring patterns from transaction history with confidence scores |
| Rules engine | ✅ | 12 condition operators, 7 action types, test UI, enable/disable toggle |
| CSV import | ✅ | Upload to R2, parse, run rules, insert/update transactions |
| Custom reports | ✅ | CRUD with filter conditions, grouping, sorting, graph types |
| Dashboard widgets | ✅ | 10 widget types, dynamic grid, add/remove, export/import JSON |
| Note entity | ✅ | Generic key-value notes for any entity type |
| Sync protocol | ✅ | WebSocket hello/ack/reject/event, snapshot sync, offline cache |
| Command palette | ✅ | Cmd+K fuzzy search for pages, accounts, payees, categories, schedules |
| Offline support | ✅ | IndexedDB cache, pending ops, disconnect/reconnect banners |
| Undo/redo | ✅ | Keyboard-only (Ctrl+Z/Ctrl+Y), covers 20+ command types, no UI affordance |
| Privacy mode | ✅ | Blurs all monetary amounts via CSS filter |
| Currency formatting | ✅ | USD/IDR with configurable exchange rate |
| Number format | ✅ | Comma-dot, dot-comma, space-dot selectable in settings |
| Date format | ✅ | ISO/US/EU selectable, applied across all pages |
| First day of week | ✅ | Sunday/Monday, applied to calendar heatmap |
| Dark theme | ✅ | Fixed dark theme |
| Reconciliation | ✅ | On account page with adjustment transaction support |
| Account display options | ✅ | Hide closed accounts toggle |
| CSV export | ✅ | All transactions as CSV file download |
| Category group rename/edit | ✅ | Inline rename, toggle hidden, toggle isIncome |
| Category group delete with transfer | ✅ | Transfer categories to another group or delete them |
| Category delete with transfer | ✅ | Transfer transactions/budgets to another category |
| Category hide/unhide | ✅ | Eye toggle, visual opacity dim |
| Income/expense visual distinction | ✅ | Green left border on income groups, dot indicators |
| Drag-and-drop reorder | ✅ | HTML5 drag handles on categories |
| Goal progress tracking | ✅ | Progress bar with funded/partial/under status |
| Rules tombstone | ✅ | Soft-delete (`deleted = 1`), separate from active toggle |
| Schedule detail page | ✅ | `/schedules/:id` with read-only view and inline editing |
| Report color scheme per report | ✅ | Stored in metadata JSON, applied to charts |
| Report cond_format / locale | ✅ | Per-report conditional formatting + number format override |
| Loading states | ✅ | All pages use PageState with loading/error/retry |
| Input validation | ✅ | TanStack Form with inline error display |

---

## What's Partially Implemented ⚠️

| Feature | Status | Notes |
|---------|--------|-------|
| Undo/redo | ⚠️ | Keyboard-only, no UI affordance, no grouping/merging of related mutations. Dashboard changes not undoable. Covers 20+ command types but no visible undo button in the UI. |
| Payee learn categories | ⚠️ | Category suggestions via payee API, but no auto-rule-creation from user behavior (3+ repeated actions). |
| Import pipeline | ⚠️ | CSV-only, no OFX/QFX. Single-transaction commands (no batch operations for large imports). |
| Calendar heatmap | ⚠️ | Spending only, not clearly distinguishing income vs expense days in the data pipeline. |

---

## Feature Comparison: Money vs Actual Budget

| Feature | Money App | Actual Budget | Gap Size |
|---------|-----------|---------------|----------|
| Envelope budgeting | ✅ SQL-computed | ✅ Spreadsheet engine | Parity |
| Tracking budget | ❌ | ✅ | **Not doing** |
| Goal templates | ✅ 5 types | ✅ 12+ with PEG parser | **Not doing** |
| Budget actions | ✅ 11 actions | ✅ 15+ actions | Small |
| Schedules | ✅ Full CRUD + discovery | ✅ Same + sync advancement | Small |
| Rules engine | ✅ 12 ops, 7 actions | ✅ 20+ ops, formula, Handlebars | **Not doing** (formula/Handlebars) |
| Import | ✅ CSV only | ✅ CSV + OFX/QFX/QIF/CAMT | **Not doing** (non-CSV) |
| Transactions | ✅ CRUD + split | ✅ CRUD + split + batch | Small (no batch ops) |
| Reports | ✅ 8 built-in + custom | ✅ Same + formula cards | Parity |
| Dashboard | ✅ 10 widgets, grid | ✅ 10+ widgets, multi-page, drag-to-reorder | Small (no multi-page, no drag-to-reorder) |
| Tags | ✅ CRUD + assign | ✅ CRUD + auto-discovery from notes | Small (no auto-discovery) |
| Payees | ✅ CRUD + merge + favorites | ✅ Same + locations + orphan detection | Small (no locations) |
| Notes | ✅ Generic key-value | ✅ Per-entity notes | Parity |
| Sync | ✅ WebSocket + snapshot | ✅ CRDT-based | Different approach (not a gap) |
| Undo/redo | ✅ Keyboard-only | ✅ Full UI + grouping | Partial (no UI, no grouping) |
| Reconciliation | ✅ Basic | ✅ Full flow with statement import | Small |
| Multi-currency | ❌ USD/IDR only | ✅ 42 currencies | **Not doing** |
| i18n | ❌ English only | ✅ Dutch/English | **Not doing** |
| Themes | ❌ Dark only | ✅ Light/Midnight/Dark | **Not doing** |
| Backup/restore | ❌ | ✅ Export all data | **Not doing** |
