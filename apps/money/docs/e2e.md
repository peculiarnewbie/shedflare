# Money E2E Test Plan

**Status:** Draft — ready for review
**Goal:** Add a Playwright-based end-to-end test for the money app that mirrors the drive e2e pattern (live Alchemy deploy → Playwright run → destroy).

---

## 1. Approach Summary

Replicate the drive e2e setup, point it at money:

- `apps/money/e2e.run.ts` — Alchemy deploy + Playwright invocation + destroy
- `apps/money/playwright.config.ts` — base URL + e2e-token header injection
- `apps/money/e2e/money.spec.ts` — single lifecycle test covering accounts → categories → transactions → budget → reports
- `apps/money/alchemy.run.ts` — accept `E2E_AUTH_EMAIL` + `E2E_AUTH_TOKEN` from env when stage starts with `e2e-`
- New `test:e2e:money` / `test:e2e:money:destroy` root scripts

Auth bypass uses the **existing `E2E_AUTH_EMAIL` / `E2E_AUTH_TOKEN` env wiring in `packages/auth-client/src/consumer.ts:62-67`** — no auth-client changes needed. The token is sent as `x-shedflare-e2e-token`, accepted only when both env vars are set (drive uses this exact pattern).

## 2. Why drive's pattern fits money

| Drive                            | Money                                                   |
| -------------------------------- | ------------------------------------------------------- |
| Owner-only deployment            | Same (shedflare is single-user)                         |
| Auth via `E2E_AUTH_*` env        | Same consumer module — drop-in                          |
| D1 + R2 resources                | Money has D1 (`MONEY_DB`) + R2 (`UPLOADS`) — same shape |
| Worker assets SPA                | Same Vite+ SolidJS build                                |
| Single `e2e.run.ts` orchestrator | Copy structure, swap stack name and stage env var names |

No Durable Object, no WebSocket — money's current implementation is D1 + R2 + REST (`/api/command`). That's simpler than drive from an e2e standpoint.

## 3. Files to Create / Modify

### 3.1 Modify `apps/money/alchemy.run.ts`

Mirror drive's gating on stage prefix and pass through e2e auth env:

```ts
const e2eAuthEmail = process.env.SHEDFLARE_MONEY_E2E_AUTH_EMAIL;
const e2eAuthToken = process.env.SHEDFLARE_MONEY_E2E_AUTH_TOKEN;
const isE2eStage = stage.startsWith("e2e-");

// inside env: { ... }
...(e2eAuthEmail && e2eAuthToken
  ? { E2E_AUTH_EMAIL: e2eAuthEmail, E2E_AUTH_TOKEN: e2eAuthToken }
  : {}),
// domain: skip configuredUrl binding on e2e stages (use workers.dev URL)
domain: !isE2eStage && config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
```

### 3.2 Modify `apps/money/package.json`

- Add `@playwright/test` devDependency
- Add `test:e2e` script: `vp exec jiti e2e.run.ts`

### 3.3 Create `apps/money/playwright.config.ts`

Copy drive verbatim, change `testDir` is implicit (relative `./e2e`).

### 3.4 Create `apps/money/e2e.run.ts`

Copy drive's structure. Rename env vars:

- `SHEDFLARE_DRIVE_E2E_STAGE` → `SHEDFLARE_MONEY_E2E_STAGE`
- `SHEDFLARE_DRIVE_E2E_AUTH_EMAIL` → `SHEDFLARE_MONEY_E2E_AUTH_EMAIL`
- `SHEDFLARE_DRIVE_E2E_AUTH_TOKEN` → `SHEDFLARE_MONEY_E2E_AUTH_TOKEN`
- Stack import: `MoneyStack` from `./alchemy.run`

Stage default: `e2e-money-${CI_JOB_ID ?? Date.now()}`.

### 3.5 Create `apps/money/e2e/money.spec.ts`

Single `test("full money lifecycle")` that exercises:

1. **Auth-gated load** — `page.goto("/")` redirects to auth callback or lands on dashboard; both must render the dashboard with empty state (no 401).
2. **Create account via UI** — `/accounts` → "+ Add Account" → name "E2E Checking" → starting balance 1000.00 → submit. Verify account appears in list. Capture account id.
3. **Verify account via API** — `GET /api/accounts` returns the account with `balanceCurrent: 100000` (cents) and `name: "E2E Checking"`.
4. **Create category via API** — `POST /api/command` with `{ commandType: "create_category", payload: { name: "Groceries", groupId: <seeded> } }`. Capture category id. (UI flow is gnarly; API is enough for this layer of test. We _also_ verify budget input in the UI later.)
5. **Create transaction via API** — `POST /api/command` with `create_transaction` referencing the account + category + amount -2500 + today's date. Verify via `GET /api/accounts/:id/transactions` it appears with correct amount.
6. **Set budget via UI** — navigate to `/budget`. Wait for category row. Set the budgeted input for "Groceries" to `500.00`, blur. Verify `col-leftover` shows `$250.00` (500 budgeted, 25 spent, leftover 475 — actually: 500 + (-25) = 475. Adjust assertions to match formula: `leftover = budgeted + spent`).
7. **Verify budget via API** — `GET /api/budget/:month` includes Groceries with `budgeted: 50000, spent: -2500, leftover: 47500`.
8. **Delete transaction via API** — `delete_transaction` command, verify it disappears from `/api/accounts/:id/transactions`.
9. **Delete account via UI** — click delete on the account card, confirm. Verify `/api/accounts` no longer includes it.
10. **Cleanup** — leave the e2e stage in a known empty state; destroy handles it.

Helper functions in the spec:

- `runCommand(context, commandType, payload)` — POST `/api/command`, assert `ok: true`, return `result.data`.
- `expectStatus(resp, code)`.
- `todayIso()` — for transaction dates.

All assertions should go through `context.request.get` (or `.post`) so the spec doesn't depend on click-flows for verification — only for the steps that prove the UI works (create account form, budget input).

### 3.6 Modify root `package.json`

Add scripts (mirror drive):

```json
"test:e2e:money": "vp exec jiti apps/money/e2e.run.ts",
"test:e2e:money:destroy": "vp exec jiti apps/money/e2e.run.ts --destroy-only"
```

### 3.7 Modify `pnpm-workspace.yaml` / catalog

Add `playwright` to the catalog if not already there for apps (it's in the root devDependencies but may need to be in catalog for the app's `@playwright/test` dep).

## 4. Open Questions / Decisions to Make First

1. **Test isolation** — each run uses a fresh `e2e-money-${ts}` stage. D1 is recreated per stage. D1 clean slate is fine because we only need known-empty starting state and the test creates its own data.
2. **Fixtures** — does the dashboard need pre-seeded widget layout? Looking at `routes/index.tsx:362-379`, widgets auto-seed on first visit. So a fresh stage's first dashboard load auto-creates the default layout. Good — no fixture needed.
3. **Income category for budget test** — `leftover = budgeted + spent`. To verify leftover math, an expense (negative amount) is enough; we don't need an income category. Keep it simple.
4. **Currency format in assertions** — money formats with `Intl.NumberFormat` from user settings. The default currency is determined by settings. Safer to assert on the API-returned `budgeted`/`spent` cents (numbers) and not on formatted strings.
5. **Playwright browser install** — drive assumes it's already installed. Document in README that first run needs `pnpm exec playwright install chromium` (or rely on the same install as drive since the package is shared at the root).
6. **CI integration** — not in scope. Drive has no CI hook for `test:e2e:drive` either, so money follows the same manual-run pattern.

## 5. Phased Rollout (small, but sequenced for safety)

| Step | What                                                | Why first                                           |
| ---- | --------------------------------------------------- | --------------------------------------------------- |
| 1    | Add e2e env wiring to `apps/money/alchemy.run.ts`   | Unblocks deploy-with-auth; smallest possible change |
| 2    | Add `playwright.config.ts` + `@playwright/test` dep | Test infra only — no behavior change                |
| 3    | Copy `e2e.run.ts` from drive, rename env vars       | Mirrors known-working pattern                       |
| 4    | Write `e2e/money.spec.ts` happy path                | First runnable test                                 |
| 5    | Run `pnpm test:e2e:money` against a real stage      | End-to-end validation; iterate on flaky selectors   |
| 6    | Add root scripts, update AGENTS.md if relevant      | Discoverability                                     |

## 6. What This Test Will NOT Cover (deliberate)

- WebSocket sync (money doesn't currently use it — REST + Drizzle only)
- CSV import (requires R2 round-trip + multipart upload — heavy for a smoke test; defer to integration test)
- Rule auto-application (covered by unit tests in `domain/commands.test.ts`)
- Schedule posting (time-dependent; belongs in unit tests)
- Recurring transactions (time-dependent; same)
- Reconciliation, hold-for-next-month, carryover math (unit-test territory; budget engine has its own suite)
- Auth beyond the e2e-token path (OAuth is tested in the auth app's own e2e/live suite)
- Multiple currencies / IDR conversion (settings-driven; add later as a second spec)

These are _intentional_ omissions — the e2e should be a fast, deterministic smoke test of the deploy + read + write paths. Domain logic lives in unit tests.

## 7. Estimated Effort

- Steps 1–3: ~30 min (copy-paste + rename)
- Step 4: ~1.5 h (writing the lifecycle test, picking selectors, getting API wire format right)
- Step 5: ~1 h (running, fixing flaky locators, dealing with currency formatting surprises, debugging auth headers)
- Step 6: ~10 min

**Total:** half a day for first green run.

## 8. Success Criteria

- `pnpm test:e2e:money` runs in ≤ 5 min (deploy + spec + destroy) against a real Cloudflare account
- Spec covers: deploy, auth, create account, create category, create transaction, set budget, delete transaction, delete account
- Failure mode is clear: selector timeout, API status code, or assertion message all identify the broken step
- Stage is destroyed in `finally` block; no orphaned resources after a failed run
- Re-running with the same stage name destroys and redeploys cleanly (Alchemy handles this via state file)

## 9. Follow-ups (not in this plan)

- Wire the same e2e harness into chat, cf-bill, s — they don't have it yet
- Add a smoke "live deploy" test for money that asserts all `/api/*` GET endpoints return 200 with the e2e token
- Consider a Vite+-native e2e (no Playwright) once `vp test` supports it — drive is stuck on Playwright so money would inherit the same friction; revisit if Vitest browser mode matures
