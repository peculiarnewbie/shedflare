/**
 * Schema-validated REST API client for the money app.
 * Every response is decoded against an Effect Schema at runtime.
 */

import * as S from "effect/Schema";
import {
  AccountsResponseSchema,
  AccountApiSchema,
  AccountTransactionsResponseSchema,
  AccountTagsResponseSchema,
  TransactionsResponseSchema,
  CategoriesResponseSchema,
  CategoryGroupsResponseSchema,
  GoalProgressResponseSchema,
  BudgetOverviewResponseSchema,
  MonthBudgetResponseSchema,
  PayeesResponseSchema,
  PayeeSuggestionsResponseSchema,
  SchedulesResponseSchema,
  ScheduleResponseSchema,
  SchedulesDiscoverResponseSchema,
  RulesResponseSchema,
  TagsResponseSchema,
  FiltersResponseSchema,
  ReportsNetWorthResponseSchema,
  ReportsCashFlowResponseSchema,
  ReportsSpendingResponseSchema,
  ReportsBudgetAnalysisResponseSchema,
  ReportsAgeOfMoneyResponseSchema,
  ReportsCrossoverResponseSchema,
  ReportsHeatmapResponseSchema,
  CustomReportsResponseSchema,
  CustomReportResultSchema,
  DashboardWidgetsResponseSchema,
  DashboardExportSchema,
  RatesResponseSchema,
  CommandResponseSchema,
} from "../domain/schemas-client";

const BASE = ""; // same-origin

// Workaround for Effect 4 beta strict decoder types
type AnyDecoder = Parameters<typeof S.decodeUnknownSync>[0];
function typedDecode<T>(schema: AnyDecoder): (input: unknown) => T {
  return S.decodeUnknownSync(schema) as unknown as (input: unknown) => T;
}

/**
 * Fetch and decode an API response against an Effect Schema.
 * Throws if the response status is not OK or if schema decoding fails.
 */
export async function fetchApi<T>(schema: AnyDecoder, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return typedDecode<T>(schema)(data);
}

export type CommandResponse = S.Schema.Type<typeof CommandResponseSchema>;

/**
 * Execute a command via POST /api/command.
 */
export async function execute(commandType: string, payload: unknown): Promise<CommandResponse> {
  const res = await fetch(`${BASE}/api/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commandType, payload }),
  });
  const data = await res.json();
  return typedDecode<CommandResponse>(CommandResponseSchema)(data);
}

// ── Typed API functions ────────────────────────────────────────────────

export const api = {
  accounts: () =>
    fetchApi<import("../domain/schemas-client").AccountsResponse>(
      AccountsResponseSchema,
      "/api/accounts",
    ),
  account: (id: string) =>
    fetchApi<import("../domain/schemas-client").AccountApi>(
      AccountApiSchema,
      `/api/accounts/${id}`,
    ),
  accountTransactions: (id: string, filterId?: string) => {
    const params = filterId ? `?filter=${encodeURIComponent(filterId)}` : "";
    return fetchApi<import("../domain/schemas-client").AccountTransactionsResponse>(
      AccountTransactionsResponseSchema,
      `/api/accounts/${id}/transactions${params}`,
    );
  },
  accountTags: (id: string) =>
    fetchApi<import("../domain/schemas-client").AccountTagsResponse>(
      AccountTagsResponseSchema,
      `/api/accounts/${id}/tags`,
    ),

  transactions: (filterId?: string) => {
    const params = filterId ? `?filter=${encodeURIComponent(filterId)}` : "";
    return fetchApi<import("../domain/schemas-client").TransactionsResponse>(
      TransactionsResponseSchema,
      `/api/transactions${params}`,
    );
  },

  categories: () =>
    fetchApi<import("../domain/schemas-client").CategoriesResponse>(
      CategoriesResponseSchema,
      "/api/categories",
    ),
  categoryGroups: () =>
    fetchApi<import("../domain/schemas-client").CategoryGroupsResponse>(
      CategoryGroupsResponseSchema,
      "/api/category-groups",
    ),
  goalProgress: () =>
    fetchApi<import("../domain/schemas-client").GoalProgressResponse>(
      GoalProgressResponseSchema,
      "/api/categories/goal-progress",
    ),

  budgetOverview: () =>
    fetchApi<import("../domain/schemas-client").BudgetOverview>(
      BudgetOverviewResponseSchema,
      "/api/budget/overview",
    ),
  budgetMonth: (monthInt: number) =>
    fetchApi<import("../domain/schemas-client").MonthBudget>(
      MonthBudgetResponseSchema,
      `/api/budget/${monthInt}`,
    ),

  payees: () =>
    fetchApi<import("../domain/schemas-client").PayeesResponse>(
      PayeesResponseSchema,
      "/api/payees",
    ),
  payeeSuggestions: (payee: string) =>
    fetchApi<import("../domain/schemas-client").PayeeSuggestionsResponse>(
      PayeeSuggestionsResponseSchema,
      `/api/payees/category-suggestions?payee=${encodeURIComponent(payee)}`,
    ),

  schedules: () =>
    fetchApi<import("../domain/schemas-client").SchedulesResponse>(
      SchedulesResponseSchema,
      "/api/schedules",
    ),
  schedule: (id: string) =>
    fetchApi<import("../domain/schemas-client").ScheduleResponse>(
      ScheduleResponseSchema,
      `/api/schedules/${id}`,
    ),
  schedulesDiscover: () =>
    fetchApi<import("../domain/schemas-client").SchedulesDiscoverResponse>(
      SchedulesDiscoverResponseSchema,
      "/api/schedules/discover",
    ),

  rules: () =>
    fetchApi<import("../domain/schemas-client").RulesResponse>(RulesResponseSchema, "/api/rules"),
  tags: () =>
    fetchApi<import("../domain/schemas-client").TagsResponse>(TagsResponseSchema, "/api/tags"),
  filters: () =>
    fetchApi<import("../domain/schemas-client").FiltersResponse>(
      FiltersResponseSchema,
      "/api/filters",
    ),

  reports: {
    netWorth: () =>
      fetchApi<import("../domain/schemas-client").ReportsNetWorthResponse>(
        ReportsNetWorthResponseSchema,
        "/api/reports/net-worth",
      ),
    cashFlow: () =>
      fetchApi<import("../domain/schemas-client").ReportsCashFlowResponse>(
        ReportsCashFlowResponseSchema,
        "/api/reports/cash-flow",
      ),
    spending: () =>
      fetchApi<import("../domain/schemas-client").ReportsSpendingResponse>(
        ReportsSpendingResponseSchema,
        "/api/reports/spending",
      ),
    budgetAnalysis: () =>
      fetchApi<import("../domain/schemas-client").ReportsBudgetAnalysisResponse>(
        ReportsBudgetAnalysisResponseSchema,
        "/api/reports/budget-analysis",
      ),
    ageOfMoney: () =>
      fetchApi<import("../domain/schemas-client").ReportsAgeOfMoneyResponse>(
        ReportsAgeOfMoneyResponseSchema,
        "/api/reports/age-of-money",
      ),
    crossover: () =>
      fetchApi<import("../domain/schemas-client").Crossover>(
        ReportsCrossoverResponseSchema,
        "/api/reports/crossover",
      ),
    calendarHeatmap: () =>
      fetchApi<import("../domain/schemas-client").ReportsHeatmapResponse>(
        ReportsHeatmapResponseSchema,
        "/api/reports/calendar-heatmap",
      ),
    custom: () =>
      fetchApi<import("../domain/schemas-client").CustomReportsResponse>(
        CustomReportsResponseSchema,
        "/api/reports/custom",
      ),
    customExecute: (id: string) =>
      fetchApi<import("../domain/schemas-client").CustomReportResult>(
        CustomReportResultSchema,
        `/api/reports/custom/${id}/execute`,
      ),
  },

  dashboard: {
    widgets: () =>
      fetchApi<import("../domain/schemas-client").DashboardWidgetsResponse>(
        DashboardWidgetsResponseSchema,
        "/api/dashboard/widgets",
      ),
    export: () =>
      fetchApi<import("../domain/schemas-client").DashboardExport>(
        DashboardExportSchema,
        "/api/dashboard/export",
      ),
  },

  rates: () =>
    fetchApi<import("../domain/schemas-client").ExchangeRateApi>(RatesResponseSchema, "/api/rates"),
};
