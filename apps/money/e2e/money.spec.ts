import { test, expect, type BrowserContext } from "@playwright/test";

type CommandResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

async function runCommand(
  context: BrowserContext,
  commandType: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> }> {
  const resp = await context.request.post("/api/command", {
    data: { commandType, payload },
  });
  expect(resp.status(), `POST /api/command ${commandType}`).toBe(200);
  const body = (await resp.json()) as CommandResult;
  if (!body.ok) {
    throw new Error(`Command ${commandType} failed: ${body.error}`);
  }
  return body;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonthInt(): number {
  const d = new Date();
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

type ApiResponse = Awaited<ReturnType<BrowserContext["request"]["get"]>>;

function expectStatus(resp: ApiResponse, code: number) {
  expect(resp.status(), resp.url()).toBe(code);
}

test.describe("Money E2E", () => {
  test("full money lifecycle", async ({ page, context }) => {
    const ts = Date.now();
    const accountName = `e2e-checking-${ts}`;
    const categoryName = `e2e-groceries-${ts}`;
    const groupName = `e2e-expenses-${ts}`;
    const payeeName = `e2e-store-${ts}`;
    const startingBalanceCents = 100_000;
    const transactionCents = -2_500;
    const budgetCents = 50_000;

    // ── Step 1: Dashboard loads with e2e auth (no OAuth round-trip) ──
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(/\/api\/auth\/login/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });

    // ── Step 2: Create a category group and category via API ──
    const groupResult = await runCommand(context, "create_category_group", { name: groupName });
    const groupId = groupResult.data.id as string;
    expect(groupId).toMatch(/^cgrp_/);

    const catResult = await runCommand(context, "create_category", {
      name: categoryName,
      groupId,
    });
    const categoryId = catResult.data.id as string;
    expect(categoryId).toMatch(/^cat_/);

    // ── Step 3: Create a payee via API ──
    const payeeResult = await runCommand(context, "create_payee", { name: payeeName });
    const payeeId = payeeResult.data.id as string;
    expect(payeeId).toMatch(/^pay_/);

    // ── Step 4: Create account via UI, verify via API ──
    await page.goto("/accounts", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /Add Account/i }).click();
    await expect(page.getByRole("heading", { name: "Add Account" })).toBeVisible();

    await page.locator('input[placeholder*="Checking"]').fill(accountName);
    await page.locator('input[type="number"]').fill("1000.00");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    await expect(page.getByText(accountName).first()).toBeVisible({ timeout: 10_000 });

    const listResp = await context.request.get("/api/accounts");
    expectStatus(listResp, 200);
    const listBody = (await listResp.json()) as {
      accounts: Array<{ id: string; name: string; balanceCurrent: number; offbudget: boolean }>;
    };
    const created = listBody.accounts.find((a) => a.name === accountName);
    expect(created, `account ${accountName} should exist`).toBeDefined();
    expect(created!.balanceCurrent).toBe(startingBalanceCents);
    expect(created!.offbudget).toBe(false);
    const accountId = created!.id;

    // ── Step 5: Create transaction via API, verify it appears ──
    const txResult = await runCommand(context, "create_transaction", {
      row: {
        accountId,
        categoryId,
        amount: transactionCents,
        payee: payeeName,
        notes: "e2e grocery run",
        date: todayIso(),
        cleared: true,
      },
    });
    const transactionId = txResult.data.id as string;
    expect(transactionId).toMatch(/^txn_/);

    const txListResp = await context.request.get(`/api/accounts/${accountId}/transactions`);
    expectStatus(txListResp, 200);
    const txListBody = (await txListResp.json()) as {
      transactions: Array<{
        id: string;
        amount: number;
        payee: string | null;
        notes: string | null;
      }>;
    };
    const tx = txListBody.transactions.find((t) => t.id === transactionId);
    expect(tx, `transaction ${transactionId} should exist`).toBeDefined();
    expect(tx!.amount).toBe(transactionCents);
    expect(tx!.payee).toBe(payeeName);
    expect(tx!.notes).toBe("e2e grocery run");

    // Account balance should now be 100_000 + (-2_500) = 97_500
    const balanceResp = await context.request.get("/api/accounts");
    const balanceBody = (await balanceResp.json()) as {
      accounts: Array<{ id: string; balanceCurrent: number }>;
    };
    expect(balanceBody.accounts.find((a) => a.id === accountId)!.balanceCurrent).toBe(
      startingBalanceCents + transactionCents,
    );

    // ── Step 6: Set budget via UI, verify via API ──
    await page.goto("/budget", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible({ timeout: 10_000 });

    const budgetRow = page
      .locator(".budget-row", { hasText: categoryName })
      .filter({ has: page.locator("input.budget-input") });
    await expect(budgetRow).toBeVisible({ timeout: 15_000 });

    const budgetInput = budgetRow.locator("input.budget-input");
    await budgetInput.fill("500.00");
    await budgetInput.blur();

    // Wait for server-side reconciliation; verify the budget endpoint agrees.
    await expect
      .poll(
        async () => {
          const resp = await context.request.get(`/api/budget/${currentMonthInt()}`);
          expectStatus(resp, 200);
          const body = (await resp.json()) as {
            month: number;
            toBudget: number;
            categories: Array<{
              categoryId: string;
              categoryName: string;
              budgeted: number;
              spent: number;
              leftover: number;
            }>;
          };
          return body.categories.find((c) => c.categoryId === categoryId);
        },
        { timeout: 10_000 },
      )
      .toMatchObject({
        categoryName,
        budgeted: budgetCents,
        spent: transactionCents,
        leftover: budgetCents + transactionCents,
      });

    // ── Step 7: Delete transaction via API, verify it disappears ──
    await runCommand(context, "delete_transaction", { id: transactionId });

    const txListAfter = await context.request.get(`/api/accounts/${accountId}/transactions`);
    const txListAfterBody = (await txListAfter.json()) as {
      transactions: Array<{ id: string }>;
    };
    expect(txListAfterBody.transactions.find((t) => t.id === transactionId)).toBeUndefined();

    // Account balance should be back to the starting balance
    const balanceAfter = await context.request.get("/api/accounts");
    const balanceAfterBody = (await balanceAfter.json()) as {
      accounts: Array<{ id: string; balanceCurrent: number }>;
    };
    expect(balanceAfterBody.accounts.find((a) => a.id === accountId)!.balanceCurrent).toBe(
      startingBalanceCents,
    );

    // ── Step 8: Delete account via API (UI delete uses `confirm()`, skip it) ──
    await runCommand(context, "delete_account", { id: accountId });

    const finalList = await context.request.get("/api/accounts");
    const finalListBody = (await finalList.json()) as {
      accounts: Array<{ id: string }>;
    };
    expect(finalListBody.accounts.find((a) => a.id === accountId)).toBeUndefined();

    // ── Step 9: Cleanup auxiliary resources ──
    await runCommand(context, "delete_category", { id: categoryId });
    await runCommand(context, "delete_category_group", { id: groupId });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Multi-currency: settings round-trip + currency-formatted display
  // ─────────────────────────────────────────────────────────────────────
  test("multi-currency settings + display", async ({ page, context }) => {
    // 1. Default currency is USD; verify settings page reflects it.
    const settingsResp = await context.request.get("/api/settings");
    const settingsBody = (await settingsResp.json()) as {
      settings: Array<{ key: string; value: string }>;
    };
    const initialCurrency = settingsBody.settings.find((s) => s.key === "display_currency");
    expect(initialCurrency?.value ?? "USD").toBe("USD");

    // 2. Switch to IDR via the Settings UI.
    await page.goto("/settings", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 10_000 });
    await page
      .locator("select")
      .filter({ hasText: /USD.*\$\)|IDR.*Rp\)/ })
      .first()
      .selectOption("IDR");

    // 3. Verify the setting persisted.
    await expect
      .poll(
        async () => {
          const resp = await context.request.get("/api/settings");
          const body = (await resp.json()) as {
            settings: Array<{ key: string; value: string }>;
          };
          return body.settings.find((s) => s.key === "display_currency")?.value;
        },
        { timeout: 10_000 },
      )
      .toBe("IDR");

    // 4. Update exchange rate; verify GET /api/rates reflects it.
    await runCommand(context, "update_exchange_rate", { usdToIdr: 16_000 });
    const ratesResp = await context.request.get("/api/rates");
    const ratesBody = (await ratesResp.json()) as { usdToIdr: number };
    expect(ratesBody.usdToIdr).toBe(16_000);

    // 5. Create an account; verify balance is rendered with the IDR symbol
    //    (no decimals, "Rp" prefix, comma thousands separator).
    const ts = Date.now();
    const accountName = `e2e-idr-${ts}`;
    await runCommand(context, "create_account", { name: accountName, balance: 16_000_000 });

    await page.goto("/accounts", { waitUntil: "networkidle" });
    await expect(page.getByText(accountName).first()).toBeVisible({ timeout: 10_000 });
    // 16_000_000 cents = 160_000 IDR. Formatter: "Rp160,000" (0 decimals).
    await expect(page.getByText("Rp160,000")).toBeVisible({ timeout: 5_000 });

    // 6. Reset to USD to leave a clean state for downstream tests.
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page
      .locator("select")
      .filter({ hasText: /USD.*\$\)|IDR.*Rp\)/ })
      .first()
      .selectOption("USD");
    await expect
      .poll(
        async () => {
          const resp = await context.request.get("/api/settings");
          const body = (await resp.json()) as {
            settings: Array<{ key: string; value: string }>;
          };
          return body.settings.find((s) => s.key === "display_currency")?.value;
        },
        { timeout: 10_000 },
      )
      .toBe("USD");

    // Cleanup
    const acctList = await context.request.get("/api/accounts");
    const acctListBody = (await acctList.json()) as {
      accounts: Array<{ id: string; name: string }>;
    };
    const acct = acctListBody.accounts.find((a) => a.name === accountName);
    if (acct) await runCommand(context, "delete_account", { id: acct.id });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Categories page: create group + category via UI, then delete group
  // ─────────────────────────────────────────────────────────────────────
  test("categories page UI flow", async ({ page, context }) => {
    const ts = Date.now();
    const groupName = `e2e-cat-group-${ts}`;
    const categoryName = `e2e-cat-${ts}`;

    await page.goto("/categories", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible({
      timeout: 10_000,
    });

    // Create a group via the page header button.
    await page.getByRole("button", { name: /Add Group/i }).click();
    await page.getByPlaceholder("e.g. Fixed Expenses").fill(groupName);
    await page.getByRole("button", { name: "Create Group" }).click();

    // The group should appear in the groups list (sidebar on this page).
    await expect(page.getByText(groupName).first()).toBeVisible({ timeout: 10_000 });

    // Verify via API
    const groupsResp = await context.request.get("/api/category-groups");
    const groupsBody = (await groupsResp.json()) as {
      groups: Array<{ id: string; name: string }>;
    };
    const group = groupsBody.groups.find((g) => g.name === groupName);
    expect(group, `group ${groupName} should exist`).toBeDefined();
    const groupId = group!.id;

    // Create a category inside this group via the per-group "+ Category" button.
    await page
      .locator(".section, [class*='group']", { hasText: groupName })
      .first()
      .getByRole("button", { name: /\+ Category|Cancel/ })
      .click();
    await page.getByPlaceholder("Category name").fill(categoryName);
    await page.getByRole("button", { name: "Add", exact: true }).click();

    // Verify via API
    const catsResp = await context.request.get("/api/categories");
    const catsBody = (await catsResp.json()) as {
      categories: Array<{ id: string; name: string; groupId: string | null }>;
    };
    const cat = catsBody.categories.find((c) => c.name === categoryName);
    expect(cat, `category ${categoryName} should exist`).toBeDefined();
    expect(cat!.groupId).toBe(groupId);

    // Reorder via API (UI drag/drop is too flaky for e2e).
    const all = catsBody.categories;
    const reorderedIds = [cat!.id, ...all.filter((c) => c.id !== cat!.id).map((c) => c.id)];
    await runCommand(context, "reorder_categories", { ids: reorderedIds });

    // Cleanup
    await runCommand(context, "delete_category", { id: cat!.id });
    await runCommand(context, "delete_category_group", { id: groupId });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Reports: net-worth, cash-flow, spending, budget-analysis
  // ─────────────────────────────────────────────────────────────────────
  test("reports endpoints", async ({ page, context }) => {
    // Seed: one income tx + one expense tx on a fresh account in the current month.
    const ts = Date.now();
    const accountName = `e2e-reports-${ts}`;
    const groupName = `e2e-rep-group-${ts}`;
    const incomeCatName = `e2e-salary-${ts}`;
    const expenseCatName = `e2e-rent-${ts}`;
    const payeeName = `e2e-emp-${ts}`;

    const accRes = await runCommand(context, "create_account", { name: accountName, balance: 0 });
    const accountId = accRes.data.id as string;

    const grpRes = await runCommand(context, "create_category_group", { name: groupName });
    const groupId = grpRes.data.id as string;

    const incRes = await runCommand(context, "create_category", {
      name: incomeCatName,
      groupId,
      isIncome: true,
    });
    const incomeCatId = incRes.data.id as string;

    const expRes = await runCommand(context, "create_category", {
      name: expenseCatName,
      groupId,
    });
    const expenseCatId = expRes.data.id as string;

    await runCommand(context, "create_payee", { name: payeeName });

    const incomeTx = await runCommand(context, "create_transaction", {
      row: {
        accountId,
        categoryId: incomeCatId,
        amount: 500_000,
        payee: payeeName,
        date: todayIso(),
        cleared: true,
      },
    });
    const expenseTx = await runCommand(context, "create_transaction", {
      row: {
        accountId,
        categoryId: expenseCatId,
        amount: -123_400,
        payee: payeeName,
        date: todayIso(),
        cleared: true,
      },
    });

    // Visit the reports page so any client-side fetch errors surface.
    await page.goto("/reports", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 10_000 });

    // ── Net worth: 12 monthly points; final point reflects all balances.
    const netWorthResp = await context.request.get("/api/reports/net-worth");
    const netWorthBody = (await netWorthResp.json()) as {
      points: Array<{ date: string; value: number }>;
    };
    expect(netWorthBody.points.length).toBe(12);
    const lastMonth = netWorthBody.points[netWorthBody.points.length - 1];
    expect(lastMonth.value).toBe(500_000 - 123_400);

    // ── Cash flow: 12 months; current month has income & expense.
    const cashFlowResp = await context.request.get("/api/reports/cash-flow");
    const cashFlowBody = (await cashFlowResp.json()) as {
      months: Array<{ month: string; income: number; expense: number }>;
    };
    expect(cashFlowBody.months.length).toBe(12);
    const thisMonth = cashFlowBody.months[cashFlowBody.months.length - 1];
    expect(thisMonth.income).toBe(500_000);
    expect(thisMonth.expense).toBe(123_400);

    // ── Spending by category (current month, abs value).
    const spendingResp = await context.request.get("/api/reports/spending");
    const spendingBody = (await spendingResp.json()) as {
      categories: Array<{ label: string; value: number; groupName: string | null }>;
    };
    const rent = spendingBody.categories.find((c) => c.label === expenseCatName);
    expect(rent, `${expenseCatName} should appear in spending`).toBeDefined();
    expect(rent!.value).toBe(123_400);
    expect(rent!.value).toBeGreaterThanOrEqual(0);

    // ── Budget analysis: current month, expense category shows actual.
    const budgetAnalysisResp = await context.request.get("/api/reports/budget-analysis");
    const budgetAnalysisBody = (await budgetAnalysisResp.json()) as {
      categories: Array<{ category: string; budgeted: number; actual: number }>;
    };
    const rentBudget = budgetAnalysisBody.categories.find((c) => c.category === expenseCatName);
    expect(rentBudget, `${expenseCatName} should appear in budget analysis`).toBeDefined();
    expect(rentBudget!.actual).toBe(-123_400);

    // Cleanup
    await runCommand(context, "delete_transaction", { id: incomeTx.data.id as string });
    await runCommand(context, "delete_transaction", { id: expenseTx.data.id as string });
    await runCommand(context, "delete_account", { id: accountId });
    await runCommand(context, "delete_category", { id: incomeCatId });
    await runCommand(context, "delete_category", { id: expenseCatId });
    await runCommand(context, "delete_category_group", { id: groupId });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Tags: create tag, attach to transaction, verify, remove
  // ─────────────────────────────────────────────────────────────────────
  test("tags + transaction tags", async ({ page, context }) => {
    const ts = Date.now();
    const tagName = `e2e-tag-${ts}`;
    const accountName = `e2e-tag-acct-${ts}`;
    const groupName = `e2e-tag-group-${ts}`;
    const categoryName = `e2e-tag-cat-${ts}`;

    // Set up: account + group + category + transaction
    const accRes = await runCommand(context, "create_account", { name: accountName, balance: 0 });
    const accountId = accRes.data.id as string;
    const grpRes = await runCommand(context, "create_category_group", { name: groupName });
    const groupId = grpRes.data.id as string;
    const catRes = await runCommand(context, "create_category", {
      name: categoryName,
      groupId,
    });
    const categoryId = catRes.data.id as string;
    const txRes = await runCommand(context, "create_transaction", {
      row: {
        accountId,
        categoryId,
        amount: -500,
        date: todayIso(),
        cleared: true,
      },
    });
    const transactionId = txRes.data.id as string;

    // Create a tag via API
    const tagRes = await runCommand(context, "create_tag", { name: tagName, color: "#ff0000" });
    const tagId = tagRes.data.id as string;
    expect(tagId).toMatch(/^tag_/);

    // Verify tag list
    const tagsResp = await context.request.get("/api/tags");
    const tagsBody = (await tagsResp.json()) as {
      tags: Array<{ id: string; name: string; color: string | null }>;
    };
    const tag = tagsBody.tags.find((t) => t.id === tagId);
    expect(tag).toBeDefined();
    expect(tag!.name).toBe(tagName);
    expect(tag!.color).toBe("#ff0000");

    // Attach tag to transaction
    await runCommand(context, "add_transaction_tag", { transactionId, tagId });

    // Verify the join
    const acctTagsResp = await context.request.get(`/api/accounts/${accountId}/tags`);
    const acctTagsBody = (await acctTagsResp.json()) as {
      transactionTags: Array<{ transactionId: string; tagId: string; tagName: string }>;
    };
    const link = acctTagsBody.transactionTags.find(
      (t) => t.transactionId === transactionId && t.tagId === tagId,
    );
    expect(link, "tag should be attached to transaction").toBeDefined();
    expect(link!.tagName).toBe(tagName);

    // Verify the tag appears in the Transactions page table.
    await page.goto("/transactions", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "All Transactions" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(tagName).first()).toBeVisible({ timeout: 10_000 });

    // Remove tag from transaction
    await runCommand(context, "remove_transaction_tag", { transactionId, tagId });
    const acctTagsAfter = await context.request.get(`/api/accounts/${accountId}/tags`);
    const acctTagsAfterBody = (await acctTagsAfter.json()) as {
      transactionTags: Array<{ transactionId: string; tagId: string }>;
    };
    expect(
      acctTagsAfterBody.transactionTags.find(
        (t) => t.transactionId === transactionId && t.tagId === tagId,
      ),
    ).toBeUndefined();

    // Delete tag
    await runCommand(context, "delete_tag", { id: tagId });
    const tagsAfter = await context.request.get("/api/tags");
    const tagsAfterBody = (await tagsAfter.json()) as {
      tags: Array<{ id: string }>;
    };
    expect(tagsAfterBody.tags.find((t) => t.id === tagId)).toBeUndefined();

    // Cleanup
    await runCommand(context, "delete_transaction", { id: transactionId });
    await runCommand(context, "delete_account", { id: accountId });
    await runCommand(context, "delete_category", { id: categoryId });
    await runCommand(context, "delete_category_group", { id: groupId });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Dashboard: add a widget via UI, verify, remove it
  // ─────────────────────────────────────────────────────────────────────
  test("dashboard widget add/remove", async ({ page, context }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });

    // Wait for the auto-seed to finish. A "Add Widget" button should appear
    // in the dashboard header once the seed completes.
    const addWidgetBtn = page.getByRole("button", { name: /Add Widget/i });
    await expect(addWidgetBtn).toBeVisible({ timeout: 15_000 });

    const beforeResp = await context.request.get("/api/dashboard/widgets");
    const beforeBody = (await beforeResp.json()) as {
      widgets: Array<{ id: string; type: string }>;
    };
    const beforeCount = beforeBody.widgets.length;

    // Add a "Markdown Note" widget via the modal.
    await addWidgetBtn.click();
    await expect(page.getByRole("heading", { name: "Add Widget" })).toBeVisible();
    await page.getByRole("button", { name: "Markdown Note" }).click();

    // Verify the new widget exists in the API.
    await expect
      .poll(
        async () => {
          const resp = await context.request.get("/api/dashboard/widgets");
          const body = (await resp.json()) as {
            widgets: Array<{ id: string; type: string }>;
          };
          return body.widgets.filter((w) => w.type === "markdown-card").length;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);

    const newWidget = beforeBody.widgets.find((w) => w.type === "markdown-card");
    // If there was already a markdown widget (unlikely on a fresh stage), skip remove.
    if (!newWidget) {
      const fresh = await context.request.get("/api/dashboard/widgets");
      const freshBody = (await fresh.json()) as {
        widgets: Array<{ id: string; type: string; meta: string | null }>;
      };
      const added = freshBody.widgets.filter((w) => w.type === "markdown-card");
      expect(added.length).toBeGreaterThan(0);
      const addedId = added[added.length - 1].id;

      // Verify default meta was set.
      expect(added[added.length - 1].meta).toContain("Write your notes here...");

      // Remove via the × button on the widget card.
      const widgetCard = page.locator(".widget-card").filter({ hasText: "Markdown Note" });
      await widgetCard.locator(".widget-close").click();

      await expect
        .poll(
          async () => {
            const resp = await context.request.get("/api/dashboard/widgets");
            const body = (await resp.json()) as {
              widgets: Array<{ id: string; type: string }>;
            };
            return body.widgets.find((w) => w.id === addedId);
          },
          { timeout: 10_000 },
        )
        .toBeUndefined();
    }

    // Final widget count should be back to the seeded value.
    const afterResp = await context.request.get("/api/dashboard/widgets");
    const afterBody = (await afterResp.json()) as {
      widgets: Array<{ id: string }>;
    };
    expect(afterBody.widgets.length).toBe(beforeCount);
  });
});
