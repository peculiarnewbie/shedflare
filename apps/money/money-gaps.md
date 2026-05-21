# Money App — Feature Gaps vs Actual Budget

Comparison target: [Actual Budget](https://actualbudget.org) — source at `/home/bolt/git/other/actual`. Reference its code/docs when implementing gaps below.

Excluded by design: additional import formats (OFX/QFX/QIF/CAMT/YNAB), bank sync (GoCardless/SimpleFIN/PluggyAI), multi-user, desktop app, plugins.

---

## Reports & Dashboards

| Gap                                 | Notes                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ~~Custom report builder UI~~        | ✅ Reports page has "Custom Reports" tab with create/edit/delete modals, lists saved reports, renders by graph type          |
| ~~Dashboard widget grid~~           | ✅ Dynamic widget grid reads from `dashboard_widgets`, renders 7 widget types, auto-seeds defaults, supports add/remove      |
| ~~Markdown card~~                   | ✅ Inline-editable markdown note card on dashboard, content stored in `meta`, basic rendering (headers, bold, lists)         |
| ~~Crossover/FI-RE projection card~~ | ✅ Dashboard widget computes FI-RE projection using 4% rule, monthly savings rate, 5% growth, SVG line chart + summary stats |
| ~~Calendar heatmap card~~           | ✅ Monthly calendar grid with per-day spending intensity color, fetches daily totals from budget engine                      |
| Sankey flow diagram card            | Not implemented                                                                                                              |
| Markdown card                       | Not implemented                                                                                                              |
| Formula card                        | Not implemented                                                                                                              |
| Summary card                        | Not implemented                                                                                                              |
| Multiple dashboard pages            | Not implemented                                                                                                              |
| Dashboard import/export (JSON)      | Not implemented                                                                                                              |
| Report color scheme config          | Not implemented                                                                                                              |
| Report cond_format / locale options | Not implemented                                                                                                              |
| Report table mode coloring          | Not implemented                                                                                                              |

## Transactions

| Gap                                       | Notes                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Split transaction UI~~                  | ✅ Inline split form with child inputs, dispatches `split_transaction`                                                                                                                                                                                        |
| ~~Reconciliation workflow~~               | ✅ Reconcile button + modal on account page: enter statement balance, shows difference, marks cleared txns as reconciled, creates adjustment txn if needed, updates `last_reconciled`                                                                         |
| ~~Reconciled flag on transactions~~       | ✅ `reconciled` column + lock-icon toggle button in transaction table                                                                                                                                                                                         |
| ~~Tag assignment per transaction~~        | ✅ Tag picker in tx table rows, colored chips, add/remove via commands                                                                                                                                                                                        |
| Undo/redo                                 | Not implemented                                                                                                                                                                                                                                               |
| Notes entity                              | Generic notes key-value store not implemented                                                                                                                                                                                                                 |
| ~~Transaction filters (saved searches)~~  | ✅ Inline filter bar on account page: condition builder (account/category/amount/date/notes/cleared/reconciled), save/load/delete filters, server-side SQL on saved filters, client-side fallback for ad-hoc. `?filter=` query param on transactions endpoint |
| ~~All transactions (global filter view)~~ | ✅ Server `/api/transactions` supports `?filter=`, new `/transactions` route with reusable TransactionTable component showing account column, filter bar works cross-account, nav item + command palette entry                                                |
| Link schedules from transactions          | Not implemented                                                                                                                                                                                                                                               |
| Payee learn categories                    | Not implemented                                                                                                                                                                                                                                               |

## Budget

| Gap                                     | Notes                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ~~Goal template UI editor~~             | ✅ Inline editor on categories page: select monthly/byDate, set amount/target date, saves to `goal_def` JSON |
| Notes-based DSL for goals               | Not implemented                                                                                              |
| Spreadsheet engine (reactive dep graph) | Shedflare uses SQL-computed values instead; no reactive cell graph                                           |
| AQL query language                      | Not implemented                                                                                              |

## Schedules

| Gap                                               | Notes                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ~~Edit existing schedule UI~~                     | ✅ Edit button opens pre-populated modal, updates via `update_schedule` command       |
| ~~End conditions (after N occurrences, on date)~~ | ✅ UI select for never/after N/on date, server-side end-condition check on post/skip  |
| ~~Weekend handling config (skip/before/after)~~   | ✅ Checkbox toggle + before/after select, server-side weekend adjustment on post/skip |
| Schedule discovery (detect recurring txns)        | Not implemented                                                                       |
| Link schedule via rules                           | Not implemented                                                                       |

## Rules

| Gap                                                              | Notes                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ~~Additional conditions (account, amount, date, cleared)~~       | ✅ account/amount/date/cleared fields + number/date ops (gt, gte, lt, lte, isapprox, isbetween) in UI and import runner |
| ~~Additional actions (prepend-notes, append-notes, delete-txn)~~ | ✅ Added prepend-notes, append-notes, delete-transaction. set-split-amount and link-schedule not yet implemented        |
| ~~Rule test UI~~                                                 | ✅ "Test" button + modal shows which existing transactions match a rule's conditions                                    |
| Formula actions (balance-of queries)                             | Not implemented                                                                                                         |
| Handlebars template helpers in actions                           | Not implemented                                                                                                         |
| ~~Enable/disable toggle~~                                        | ✅ ON/OFF toggle per rule, `active` column added to schema                                                              |
| Payee-specific rules (learn_categories)                          | Not implemented                                                                                                         |
| Tombstone (soft-delete)                                          | Rules are hard-deleted; no tombstone                                                                                    |

## Categories

| Gap                                            | Notes                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| ~~Category group rename/edit in UI~~           | ✅ Inline rename on click, toggle hidden (eye icon), toggle isIncome                                                     |
| ~~Category group delete with transfer~~        | ✅ Confirm dialog with option to transfer categories to another group or delete them inside                              |
| ~~Category delete with transfer~~              | ✅ Confirm dialog with option to transfer transactions/budgets to another category                                       |
| ~~Category hide/unhide toggle~~                | ✅ Eye toggle button on each category row, visual opacity dim for hidden                                                 |
| ~~Category group hide/unhide toggle~~          | ✅ Eye toggle button on each group header, hidden groups list at bottom                                                  |
| ~~Category income/expense visual distinction~~ | ✅ Green left border on income groups, green/purple dot indicator, `section-income` class                                |
| ~~Drag-and-drop reorder~~                      | ✅ HTML5 drag-and-drop in categories page, drag handles on each category row, uses existing `reorder_categories` handler |
| ~~Goal progress tracking~~                     | ✅ Progress bar + label in categories page: funded/partial/under status with amounts                                     |
| Additional goal types (refill, periodic, %)    | Only monthly and byDate supported                                                                                        |
| Note-based templates                           | Not implemented                                                                                                          |
| Template priority system                       | Not implemented                                                                                                          |

## Payees

| Gap                                          | Notes                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Learn categories from transaction history    | Not implemented                                                               |
| Payee locations (geolocation)                | Not implemented                                                               |
| ~~Payee autocomplete dropdown in txn table~~ | ✅ HTML datalist suggests existing payee names in add-tx form and inline edit |

## Settings & Configuration

| Gap                                                                               | Notes                                                                            |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Currency formatting (46+ currencies)                                              | Only USD and IDR supported                                                       |
| Number format locale                                                              | Not implemented                                                                  |
| ~~Date format selection~~                                                         | ✅ ISO/US/EU selectable in settings, applied to all date displays                |
| First day of week                                                                 | Not implemented                                                                  |
| ~~Privacy mode (hide amounts)~~                                                   | ✅ Toggle in settings blurs all amounts via CSS filter; applied across all pages |
| Light / Midnight themes                                                           | Dark theme only                                                                  |
| Custom themes & CSS override                                                      | Not implemented                                                                  |
| Language / i18n                                                                   | Not implemented                                                                  |
| Backups list / restore                                                            | Not implemented                                                                  |
| Encryption enable/disable                                                         | Not implemented                                                                  |
| Experimental feature flags                                                        | Not implemented                                                                  |
| ~~Account display options (hide closed, show balances, hide cleared/reconciled)~~ | ✅ Hide closed accounts toggle in settings filters the accounts list             |

## Infrastructure

| Gap                      | Notes                                                                |
| ------------------------ | -------------------------------------------------------------------- |
| CRDT conflict resolution | Shedflare uses event sourcing + idempotent commands instead          |
| End-to-end encryption    | Not implemented                                                      |
| Node.js API library      | Not implemented                                                      |
| CLI tool                 | `packages/cli/` exists but is deprecated, no money-specific commands |

## UI / Polish

| Gap                                        | Notes                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| ~~Keyboard shortcuts (Cmd+K command bar)~~ | ✅ Mod+K opens command palette: fuzzy search pages, accounts, payees, categories, schedules; keyboard nav |
| Loading states on pages                    | Some pages lack proper loading/error states                                                               |
| Input validation errors displayed to user  | Effect/Schema errors may cause unhandled rejections                                                       |
| ~~Offline indicator in header~~            | ✅ Sticky banner on disconnect + reconnecting state with attempt count/delay in sidebar and mobile header |
| Goal templates category editor             | `goal_def` JSON stored but no inline editor on categories page                                            |
| ~~Schedule edit page~~                     | ✅ `/schedules/:id` route with detail view and inline editing form                                        |
| Report color scheme per report             | Not implemented                                                                                           |
