# Money App — Feature Gaps vs Actual Budget

Comparison target: [Actual Budget](https://actualbudget.org) — source at `/home/bolt/git/other/actual`. Reference its code/docs when implementing gaps below.

Excluded by design: additional import formats (OFX/QFX/QIF/CAMT/YNAB), bank sync (GoCardless/SimpleFIN/PluggyAI), multi-user, desktop app, plugins.

---

## Reports & Dashboards

| Gap                                 | Notes                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Custom report builder UI            | Backend table + CRUD commands exist, no frontend UI                                  |
| Dashboard widget grid               | `dashboard_widgets` table + `update_dashboard` command exist, dash page ignores them |
| Crossover/FI-RE projection card     | Not implemented                                                                      |
| Calendar heatmap card               | Not implemented                                                                      |
| Sankey flow diagram card            | Not implemented                                                                      |
| Markdown card                       | Not implemented                                                                      |
| Formula card                        | Not implemented                                                                      |
| Summary card                        | Not implemented                                                                      |
| Multiple dashboard pages            | Not implemented                                                                      |
| Dashboard import/export (JSON)      | Not implemented                                                                      |
| Report color scheme config          | Not implemented                                                                      |
| Report cond_format / locale options | Not implemented                                                                      |
| Report table mode coloring          | Not implemented                                                                      |

## Transactions

| Gap                                  | Notes                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------- |
| ~~Split transaction UI~~             | ✅ Inline split form with child inputs, dispatches `split_transaction`  |
| Reconciliation workflow              | `last_reconciled` field on accounts exists, no reconcile wizard or UI   |
| ~~Reconciled flag on transactions~~  | ✅ `reconciled` column + lock-icon toggle button in transaction table   |
| Tag assignment per transaction       | `transaction_tags` join table exists, no UI to assign tags in txn table |
| Undo/redo                            | Not implemented                                                         |
| Notes entity                         | Generic notes key-value store not implemented                           |
| Transaction filters (saved searches) | Not implemented                                                         |
| Link schedules from transactions     | Not implemented                                                         |
| Payee learn categories               | Not implemented                                                         |

## Budget

| Gap                                     | Notes                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Goal template UI editor                 | Goal engine (`apply_goal_templates`) works server-side, no category editor UI |
| Notes-based DSL for goals               | Not implemented                                                               |
| Spreadsheet engine (reactive dep graph) | Shedflare uses SQL-computed values instead; no reactive cell graph            |
| AQL query language                      | Not implemented                                                               |

## Schedules

| Gap                                               | Notes                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ~~Edit existing schedule UI~~                     | ✅ Edit button opens pre-populated modal, updates via `update_schedule` command       |
| ~~End conditions (after N occurrences, on date)~~ | ✅ UI select for never/after N/on date, server-side end-condition check on post/skip  |
| ~~Weekend handling config (skip/before/after)~~   | ✅ Checkbox toggle + before/after select, server-side weekend adjustment on post/skip |
| Schedule discovery (detect recurring txns)        | Not implemented                                                                       |
| Link schedule via rules                           | Not implemented                                                                       |

## Rules

| Gap                                                                                    | Notes                                                                                                                   |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ~~Additional conditions (account, amount, date, cleared)~~                             | ✅ account/amount/date/cleared fields + number/date ops (gt, gte, lt, lte, isapprox, isbetween) in UI and import runner |
| Additional actions (set-split-amount, link-schedule, prepend/append-notes, delete-txn) | Only set category/payee/notes actions                                                                                   |
| Rule test UI                                                                           | Not implemented                                                                                                         |
| Formula actions (balance-of queries)                                                   | Not implemented                                                                                                         |
| Handlebars template helpers in actions                                                 | Not implemented                                                                                                         |
| ~~Enable/disable toggle~~                                                              | ✅ ON/OFF toggle per rule, `active` column added to schema                                                              |
| Payee-specific rules (learn_categories)                                                | Not implemented                                                                                                         |
| Tombstone (soft-delete)                                                                | Rules are hard-deleted; no tombstone                                                                                    |

## Payees

| Gap                                          | Notes                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Learn categories from transaction history    | Not implemented                                                               |
| Payee locations (geolocation)                | Not implemented                                                               |
| ~~Payee autocomplete dropdown in txn table~~ | ✅ HTML datalist suggests existing payee names in add-tx form and inline edit |

## Settings & Configuration

| Gap                                                                           | Notes                      |
| ----------------------------------------------------------------------------- | -------------------------- |
| Currency formatting (46+ currencies)                                          | Only USD and IDR supported |
| Number format locale                                                          | Not implemented            |
| Date format selection                                                         | Not implemented            |
| First day of week                                                             | Not implemented            |
| Privacy mode (hide amounts)                                                   | Not implemented            |
| Light / Midnight themes                                                       | Dark theme only            |
| Custom themes & CSS override                                                  | Not implemented            |
| Language / i18n                                                               | Not implemented            |
| Backups list / restore                                                        | Not implemented            |
| Encryption enable/disable                                                     | Not implemented            |
| Experimental feature flags                                                    | Not implemented            |
| Account display options (hide closed, show balances, hide cleared/reconciled) | Not implemented            |

## Infrastructure

| Gap                      | Notes                                                                |
| ------------------------ | -------------------------------------------------------------------- |
| CRDT conflict resolution | Shedflare uses event sourcing + idempotent commands instead          |
| End-to-end encryption    | Not implemented                                                      |
| Node.js API library      | Not implemented                                                      |
| CLI tool                 | `packages/cli/` exists but is deprecated, no money-specific commands |

## UI / Polish

| Gap                                       | Notes                                                          |
| ----------------------------------------- | -------------------------------------------------------------- |
| Keyboard shortcuts (Cmd+K command bar)    | Not implemented                                                |
| Loading states on pages                   | Some pages lack proper loading/error states                    |
| Input validation errors displayed to user | Effect/Schema errors may cause unhandled rejections            |
| Offline indicator in header               | Sync indicator shows connection status but no offline UX       |
| Goal templates category editor            | `goal_def` JSON stored but no inline editor on categories page |
| Schedule edit page                        | No `/schedules/:id` route                                      |
| Report color scheme per report            | Not implemented                                                |
