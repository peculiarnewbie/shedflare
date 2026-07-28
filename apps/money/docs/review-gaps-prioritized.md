# Money App Review Gaps, Prioritized

Review date: 2026-06-23  
Last recheck: 2026-07-13 (correctness + visual bug-fix pass)

Scope: frontend design, TypeScript/data-loading quality, and a gap recheck against `/home/bolt/git/other/actual`.

This document tracks real gaps only. It intentionally excludes the known non-goals listed in `docs/archive/money-gaps.md`, including CRDT sync, bank sync providers, desktop app, i18n, extra themes, broad multi-currency, non-CSV imports, AQL, spreadsheet formulas, formula/Handlebars rules, and multi-user support.

## Status After 2026-07-13 Fix Pass

| Status          | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fixed earlier   | Closed-account banner; budget reload after edit; settings `subscribeChanges`; README architecture truth; server schedule posting                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Fixed this pass | Ad-hoc filters (conditions query + and/or toggle); split parent flags/sum validation/orphan delete + UI reload; month last-day spending (`date <= end`); TZ-safe calendar dates; live-ledger net worth / age-of-money / account balances (exclude children); transfer/cover budget debit+credit; schedule post/skip UI refresh + undo `recurrenceRules`; tags on all-transactions; CSS token aliases (`--bg-page`, `--text-primary`, `--primary`, …); missing utility classes; table overflow; DM fonts; discover/goal Effect schemas; `execute` HTTP status check |
| Still open      | Route-level `any` on schedules/rules/reports; shared reference-data cache; batch ops; multi-dashboard; payee learning; DO/offline rewrite; distinctive redesign; some privacy leaks on reports/charts; date-format reactive tests still skipped                                                                                                                                                                                                                                                                                                                    |

## Remaining Ranked Gaps

| Rank | Gap                                                   | Impact      | Effort     | Notes                                                            |
| ---- | ----------------------------------------------------- | ----------- | ---------- | ---------------------------------------------------------------- |
| 1    | Tighten remaining route `any` casts                   | Medium      | Medium     | schedules/rules/reports still heavy                              |
| 2    | Shared reference-data cache                           | High        | High       | accounts/categories/tags/payees loaded per route                 |
| 3    | Batch/bulk transaction operations                     | Medium-high | High       | import + bulk edit                                               |
| 4    | Privacy blur on reports/dashboard charts              | Medium      | Low-medium | partial coverage after this pass                                 |
| 5    | Unskip date-format reactive tests                     | Low         | Low        | format logic covered; subscription tests flake in workspace mode |
| 6    | Dashboard pages / payee learning / redesign / offline | Strategic   | High+      | defer                                                            |

## Evidence Notes (historical — many fixed)

See git history and the 2026-07-13 pass for closed items. Prefer verifying against current code rather than the original June notes below.

### Closed-Account Banner — FIXED

Banner now uses `allClosedAccounts()` separately from the filtered list.

### Budget Derived Values — FIXED

`budget.tsx` awaits `loadBudget()` after `set_budget_amount`.

### Transaction Filter Double Load — FIXED

Effect owns fetch on both transactions and account pages; ad-hoc conditions are sent as query params.

### Settings Store — MOSTLY FIXED

`subscribeChanges` notifies; some reactive format tests remain skipped.

### Architecture Truth — FIXED

README distinguishes D1/REST vs target DO/WS.

### Schedule Posting — SERVER FIXED; UI REFRESH FIXED THIS PASS

Post creates txn + advances; list/detail reload after post/skip; undo uses `recurrenceRules`.

### Shared App Data Cache / Batch / Dashboard Pages / Payee Learning / Offline / Redesign

Still deferred product gaps.
