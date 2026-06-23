# Money App Review Gaps, Prioritized

Review date: 2026-06-23

Scope: frontend design, TypeScript/data-loading quality, and a gap recheck against `/home/bolt/git/other/actual`.

This document tracks real gaps only. It intentionally excludes the known non-goals listed in `docs/archive/money-gaps.md`, including CRDT sync, bank sync providers, desktop app, i18n, extra themes, broad multi-currency, non-CSV imports, AQL, spreadsheet formulas, formula/Handlebars rules, and multi-user support.

## Ranked By Effort/Impact

| Rank | Gap                                                    | Impact      | Effort      | Ratio          | Why this order                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------ | ----------- | ----------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Fix closed-account hidden count banner                 | Low-medium  | Very low    | Best quick win | Current UI says hidden accounts are configurable but the count can never render because the list is already filtered. Tiny correctness fix.                                                                          |
| 2    | Reconcile budget derived values after edits            | High        | Low         | Excellent      | Budget editing currently patches only `budgeted`; `toBudget`, leftovers, and group totals can go stale even though the server returns recalculated budget data.                                                      |
| 3    | Remove double-load paths on transaction filter changes | Medium      | Low         | Excellent      | Avoids duplicate requests and flickery loading on a high-traffic screen. Also clarifies the data-loading model.                                                                                                      |
| 4    | Make settings store actually reactive and typed        | High        | Low-medium  | Excellent      | Global settings now load in layout, but subscriptions are no-ops and tests for true reactive behavior are skipped. This affects currency, date format, privacy, first-day-of-week, and closed-account display.       |
| 5    | Document architecture truth or rename claims           | High        | Low-medium  | Excellent      | README/plan claim DO/WebSocket/IndexedDB/TanStack DB, but the shipped app is D1 + REST + localStorage settings. Correct docs prevent future work from targeting nonexistent infrastructure.                          |
| 6    | Tighten route-level client types                       | Medium      | Medium      | Good           | API responses are schema-decoded, then several routes cast back to `any`. Removing those casts improves safety before larger state-management work.                                                                  |
| 7    | Add real schedule posting/advancement                  | High        | Medium-high | Good           | Actual posts due schedule transactions; Money currently marks a schedule completed only. This is user-visible automation correctness.                                                                                |
| 8    | Introduce shared app data cache for common entities    | High        | High        | Good           | Accounts, categories, tags, settings, payees, and dashboard data are loaded ad hoc per route. A small shared cache/store would reduce stale data and duplicate requests without jumping all the way to offline sync. |
| 9    | Add batch/bulk transaction operations                  | Medium-high | High        | Medium         | Actual batches transaction updates/imports. Money has single-row command paths, which will hurt CSV imports and bulk editing as data grows.                                                                          |
| 10   | Add dashboard pages                                    | Medium      | Medium-high | Medium         | Actual supports multiple dashboard pages. Useful, but less urgent for a single-owner app than correctness and loading fixes.                                                                                         |
| 11   | Add payee category learning                            | Medium      | High        | Lower          | Actual can learn category rules from repeated payee/category edits. Money has suggestions, but full learning is more behaviorally complex and may overlap with planned LLM categorization.                           |
| 12   | Full DO/WebSocket/offline-first architecture           | Very high   | Very high   | Strategic      | Highest architectural impact, but also the largest rewrite. Do this only if offline/realtime/multi-device consistency is a product goal now, not just because old docs promised it.                                  |
| 13   | Distinctive frontend redesign pass                     | Medium      | Medium-high | Strategic      | The UI is usable but generic. Worth doing after state correctness stabilizes, otherwise polish may be churned by data-flow changes.                                                                                  |

## Evidence Notes

### Closed-Account Banner

`apps/money/src/routes/accounts.tsx` computes `closedAccounts()` as an empty list when `hideClosed()` is true, then checks `hideClosed() && closedAccounts().length > 0`. The banner cannot display.

Recommended fix: compute `allClosedAccounts` separately, then derive `visibleClosedAccounts` from it.

### Budget Derived Values

`apps/money/src/routes/budget.tsx` dispatches `set_budget_amount` and locally patches only the edited category's `budgeted` value. The server handler returns recalculated budget data from `computeMonthBudget`, but the client ignores it.

Recommended fix: await the command result or reload the budget after the mutation. Prefer applying the returned recalculated budget if the command response shape is stable.

### Transaction Filter Double Load

`apps/money/src/routes/transactions.tsx` calls `loadData()` directly in `handleFilterChange`, and the page effect also calls `loadData()` after `filterId` changes.

Recommended fix: choose one trigger. The smallest fix is to remove the explicit `loadData()` from `handleFilterChange` and let the reactive effect own fetching.

### Settings Store

`apps/money/src/components/layout.tsx` now calls `loadSettings()`, which addresses the earlier issue where settings were effectively page-local. However, `settingsCollection.subscribeChanges` in `apps/money/src/lib/settings-store.ts` is a no-op, `loadSettings()` decodes with `any`, and reactive tests for enabled privacy/date formats are skipped.

Recommended fix: expose a small typed settings signal API instead of preserving a fake collection interface. If compatibility is needed short-term, make `subscribeChanges` actually notify listeners from `setSetting` and `loadSettings`.

### Architecture Truth

The README describes Durable Objects, WebSocket sync, IndexedDB offline cache, and TanStack DB. The current stack uses D1, R2, REST API handlers, and localStorage-backed settings.

Recommended fix: update the README and plan status to distinguish current implementation from target architecture. This avoids treating nonexistent sync/offline behavior as already implemented.

### Route Types

Several route files use `any` or cast decoded API responses back to `any`, especially transactions, account, schedules, reports, and command bar code.

Recommended fix: derive route types from `schemas-client` exports or component prop types. Do this opportunistically while touching each route.

### Schedule Posting

Actual's schedule service posts transactions for due schedules. Money's `post_schedule_transaction` only marks a schedule completed.

Recommended fix: create the transaction from the schedule, set `scheduleId`, advance `nextDate` or complete one-shot schedules, and return enough data for the UI to refresh affected screens.

### Shared App Data Cache

Money currently fetches common supporting data per route: accounts, categories, tags, settings, payees, widgets, and reports. This is simpler than TanStack DB/offline sync but creates stale-data and duplicate-load risks.

Recommended fix: introduce a small shared resource/store for frequently reused reference data. Start with settings, accounts, categories, tags, and payees before dashboard/report data.

### Batch Operations

Actual batches transaction changes and sync messages. Money's command handlers are mostly single-row commands, with import issuing single transaction operations conceptually.

Recommended fix: add batch command handlers for import and bulk edit/delete first. Avoid broad abstraction until the first real batch path exists.

### Dashboard Pages

Actual supports multiple dashboard pages and page-scoped widgets. Money currently has one dashboard widget set.

Recommended fix: defer unless the owner actually needs multiple dashboards. If implemented, add a `dashboard_pages` table and scope widgets to a page.

### Payee Category Learning

Actual stores per-payee learning behavior and can generate category-setting rules from repeated edits. Money currently provides category suggestions but does not learn/update rules.

Recommended fix: defer until the desired rule/LLM categorization model is settled.

### Full Offline/Realtime Architecture

The largest mismatch is the planned DO + WebSocket + IndexedDB + TanStack DB architecture versus the current D1 REST implementation.

Recommended fix: do not start with this rewrite. First fix correctness issues above, then decide whether offline/realtime is still a goal. If yes, write a migration design that covers command idempotency, snapshot/replay, local cache invalidation, and conflict behavior.

### Frontend Redesign

The UI is consistent but generic: system fonts, emoji nav, conventional dark admin styling, and many inline styles. It is acceptable for utility use but not distinctive.

Recommended fix: postpone a full visual redesign until data/state flows settle. When ready, replace emoji nav with a coherent icon system, improve table density and mobile transaction flows, and consolidate modal/form styling.

## Suggested Execution Order

1. Fix closed-account banner.
2. Apply server-returned budget recalculations after budget edits.
3. Remove duplicate transaction filter loads.
4. Make settings store typed and actually reactive; unskip the relevant settings tests.
5. Correct README/plan claims to current architecture versus target architecture.
6. Add schedule posting/advancement.
7. Add a shared reference-data cache.
8. Add batch transaction/import operations.
9. Revisit dashboard pages and payee learning based on owner workflow.
10. Decide explicitly whether to pursue the full DO/WebSocket/offline architecture.
11. Redesign the UI once state/data behavior is stable.
