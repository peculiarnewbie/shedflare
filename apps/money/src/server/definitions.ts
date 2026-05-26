import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

// ── Upload endpoints (already existed) ────────────────────────────────

const uploadEp: any = { ...HttpApiEndpoint.put("upload", "/api/upload") };
const downloadEp: any = { ...HttpApiEndpoint.get("download", "/api/upload/:key") };
downloadEp.params = { key: undefined as any };

const uploadsGroup: any = HttpApiGroup.make("uploads");
uploadsGroup.endpoints["upload"] = uploadEp;
uploadsGroup.endpoints["download"] = downloadEp;

// ── Accounts ──────────────────────────────────────────────────────────

const accountsListEp: any = { ...HttpApiEndpoint.get("list", "/api/accounts") };
const accountGetEp: any = { ...HttpApiEndpoint.get("get", "/api/accounts/:id") };
accountGetEp.params = { id: undefined as any };
const accountTxEp: any = {
  ...HttpApiEndpoint.get("transactions", "/api/accounts/:id/transactions"),
};
accountTxEp.params = { id: undefined as any };
const accountTagsEp: any = { ...HttpApiEndpoint.get("tags", "/api/accounts/:id/tags") };
accountTagsEp.params = { id: undefined as any };

const accountsGroup: any = HttpApiGroup.make("accounts");
accountsGroup.endpoints["list"] = accountsListEp;
accountsGroup.endpoints["get"] = accountGetEp;
accountsGroup.endpoints["transactions"] = accountTxEp;
accountsGroup.endpoints["tags"] = accountTagsEp;

// ── Transactions ──────────────────────────────────────────────────────

const txListEp: any = { ...HttpApiEndpoint.get("list", "/api/transactions") };

const transactionsGroup: any = HttpApiGroup.make("transactions");
transactionsGroup.endpoints["list"] = txListEp;

// ── Categories ────────────────────────────────────────────────────────

const catListEp: any = { ...HttpApiEndpoint.get("list", "/api/categories") };
const catGroupsEp: any = { ...HttpApiEndpoint.get("groups", "/api/category-groups") };
const catGoalEp: any = {
  ...HttpApiEndpoint.get("goalProgress", "/api/categories/goal-progress"),
};

const categoriesGroup: any = HttpApiGroup.make("categories");
categoriesGroup.endpoints["list"] = catListEp;
categoriesGroup.endpoints["groups"] = catGroupsEp;
categoriesGroup.endpoints["goalProgress"] = catGoalEp;

// ── Budget ────────────────────────────────────────────────────────────

const budgetOverviewEp: any = { ...HttpApiEndpoint.get("overview", "/api/budget/overview") };
const budgetMonthEp: any = { ...HttpApiEndpoint.get("month", "/api/budget/:month") };
budgetMonthEp.params = { month: undefined as any };

const budgetGroup: any = HttpApiGroup.make("budget");
budgetGroup.endpoints["overview"] = budgetOverviewEp;
budgetGroup.endpoints["month"] = budgetMonthEp;

// ── Payees ────────────────────────────────────────────────────────────

const payeeListEp: any = { ...HttpApiEndpoint.get("list", "/api/payees") };
const payeeSuggestionsEp: any = {
  ...HttpApiEndpoint.get("suggestions", "/api/payees/category-suggestions"),
};

const payeesGroup: any = HttpApiGroup.make("payees");
payeesGroup.endpoints["list"] = payeeListEp;
payeesGroup.endpoints["suggestions"] = payeeSuggestionsEp;

// ── Schedules ─────────────────────────────────────────────────────────

const scheduleListEp: any = { ...HttpApiEndpoint.get("list", "/api/schedules") };
const scheduleGetEp: any = { ...HttpApiEndpoint.get("get", "/api/schedules/:id") };
scheduleGetEp.params = { id: undefined as any };
const scheduleDiscoverEp: any = {
  ...HttpApiEndpoint.get("discover", "/api/schedules/discover"),
};

const schedulesGroup: any = HttpApiGroup.make("schedules");
schedulesGroup.endpoints["list"] = scheduleListEp;
schedulesGroup.endpoints["get"] = scheduleGetEp;
schedulesGroup.endpoints["discover"] = scheduleDiscoverEp;

// ── Rules ─────────────────────────────────────────────────────────────

const ruleListEp: any = { ...HttpApiEndpoint.get("list", "/api/rules") };

const rulesGroup: any = HttpApiGroup.make("rules");
rulesGroup.endpoints["list"] = ruleListEp;

// ── Tags ──────────────────────────────────────────────────────────────

const tagListEp: any = { ...HttpApiEndpoint.get("list", "/api/tags") };

const tagsGroup: any = HttpApiGroup.make("tags");
tagsGroup.endpoints["list"] = tagListEp;

// ── Filters ───────────────────────────────────────────────────────────

const filterListEp: any = { ...HttpApiEndpoint.get("list", "/api/filters") };

const filtersGroup: any = HttpApiGroup.make("filters");
filtersGroup.endpoints["list"] = filterListEp;

// ── Reports ───────────────────────────────────────────────────────────

const reportNetWorthEp: any = {
  ...HttpApiEndpoint.get("netWorth", "/api/reports/net-worth"),
};
const reportCashFlowEp: any = {
  ...HttpApiEndpoint.get("cashFlow", "/api/reports/cash-flow"),
};
const reportSpendingEp: any = {
  ...HttpApiEndpoint.get("spending", "/api/reports/spending"),
};
const reportBudgetAnalysisEp: any = {
  ...HttpApiEndpoint.get("budgetAnalysis", "/api/reports/budget-analysis"),
};
const reportAgeOfMoneyEp: any = {
  ...HttpApiEndpoint.get("ageOfMoney", "/api/reports/age-of-money"),
};
const reportCrossoverEp: any = {
  ...HttpApiEndpoint.get("crossover", "/api/reports/crossover"),
};
const reportCalendarHeatmapEp: any = {
  ...HttpApiEndpoint.get("calendarHeatmap", "/api/reports/calendar-heatmap"),
};
const reportCustomListEp: any = {
  ...HttpApiEndpoint.get("customList", "/api/reports/custom"),
};
const reportCustomExecEp: any = {
  ...HttpApiEndpoint.get("customExecute", "/api/reports/custom/:id/execute"),
};
reportCustomExecEp.params = { id: undefined as any };

const reportsGroup: any = HttpApiGroup.make("reports");
reportsGroup.endpoints["netWorth"] = reportNetWorthEp;
reportsGroup.endpoints["cashFlow"] = reportCashFlowEp;
reportsGroup.endpoints["spending"] = reportSpendingEp;
reportsGroup.endpoints["budgetAnalysis"] = reportBudgetAnalysisEp;
reportsGroup.endpoints["ageOfMoney"] = reportAgeOfMoneyEp;
reportsGroup.endpoints["crossover"] = reportCrossoverEp;
reportsGroup.endpoints["calendarHeatmap"] = reportCalendarHeatmapEp;
reportsGroup.endpoints["customList"] = reportCustomListEp;
reportsGroup.endpoints["customExecute"] = reportCustomExecEp;

// ── Dashboard ─────────────────────────────────────────────────────────

const dashboardWidgetsEp: any = {
  ...HttpApiEndpoint.get("widgets", "/api/dashboard/widgets"),
};
const dashboardExportEp: any = {
  ...HttpApiEndpoint.get("export", "/api/dashboard/export"),
};

const dashboardGroup: any = HttpApiGroup.make("dashboard");
dashboardGroup.endpoints["widgets"] = dashboardWidgetsEp;
dashboardGroup.endpoints["export"] = dashboardExportEp;

// ── Command ───────────────────────────────────────────────────────────

const commandEp: any = { ...HttpApiEndpoint.post("execute", "/api/command") };

const commandGroup: any = HttpApiGroup.make("command");
commandGroup.endpoints["execute"] = commandEp;

// ── Data ──────────────────────────────────────────────────────────────

const dataDumpEp: any = { ...HttpApiEndpoint.get("dump", "/api/data") };

const dataGroup: any = HttpApiGroup.make("data");
dataGroup.endpoints["dump"] = dataDumpEp;

// ── Export ────────────────────────────────────────────────────────────

const exportCsvEp: any = { ...HttpApiEndpoint.get("csv", "/api/export/csv") };

const exportGroup: any = HttpApiGroup.make("export");
exportGroup.endpoints["csv"] = exportCsvEp;

// ── Rates ─────────────────────────────────────────────────────────────

const ratesGetEp: any = { ...HttpApiEndpoint.get("get", "/api/rates") };

const ratesGroup: any = HttpApiGroup.make("rates");
ratesGroup.endpoints["get"] = ratesGetEp;

// ── Settings ──────────────────────────────────────────────────────────

const settingsGetEp: any = { ...HttpApiEndpoint.get("get", "/api/settings") };

const settingsGroup: any = HttpApiGroup.make("settings");
settingsGroup.endpoints["get"] = settingsGetEp;

// ── API root ──────────────────────────────────────────────────────────

export const moneyApi: any = HttpApi.make("money");
moneyApi.groups["uploads"] = uploadsGroup;
moneyApi.groups["accounts"] = accountsGroup;
moneyApi.groups["transactions"] = transactionsGroup;
moneyApi.groups["categories"] = categoriesGroup;
moneyApi.groups["budget"] = budgetGroup;
moneyApi.groups["payees"] = payeesGroup;
moneyApi.groups["schedules"] = schedulesGroup;
moneyApi.groups["rules"] = rulesGroup;
moneyApi.groups["tags"] = tagsGroup;
moneyApi.groups["filters"] = filtersGroup;
moneyApi.groups["reports"] = reportsGroup;
moneyApi.groups["dashboard"] = dashboardGroup;
moneyApi.groups["command"] = commandGroup;
moneyApi.groups["data"] = dataGroup;
moneyApi.groups["export"] = exportGroup;
moneyApi.groups["rates"] = ratesGroup;
moneyApi.groups["settings"] = settingsGroup;
