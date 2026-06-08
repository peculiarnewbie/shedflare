/**
 * Smoke test for the test infrastructure itself:
 * confirms we can boot a money-shaped D1 shim and that all expected tables exist.
 */
import { describe, expect, test } from "vite-plus/test";
import { createMoneyTestD1 } from "./d1-shim";

describe("test infra", () => {
  test("createMoneyTestD1 initialises all money tables", async () => {
    const d1 = createMoneyTestD1();
    const rows = (await d1
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()) as unknown as { results: Array<{ name: string }> };

    const tables = rows.results.map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "accounts",
        "budget_months",
        "budgets",
        "categories",
        "category_groups",
        "custom_reports",
        "dashboard_widgets",
        "exchange_rates",
        "notes",
        "payees",
        "rules",
        "schedules",
        "settings",
        "tags",
        "transaction_filters",
        "transaction_tags",
        "transactions",
      ]),
    );
  });

  test("default exchange rate is inserted", async () => {
    const d1 = createMoneyTestD1();
    const { results } = (await d1
      .prepare("SELECT id, usd_to_idr FROM exchange_rates")
      .all()) as unknown as { results: Array<{ id: string; usd_to_idr: number }> };
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("latest");
    expect(results[0].usd_to_idr).toBe(16000);
  });
});
