import { sql } from "drizzle-orm";
import type { Db } from "./d1-access";

interface GroupedTransaction {
  payee: string;
  accountId: string;
  amount: number;
  date: string;
  categoryId: string | null;
}

interface TransactionGroup {
  payee: string;
  accountId: string;
  transactions: GroupedTransaction[];
}

interface IntervalStats {
  median: number;
  mean: number;
  stdDev: number;
  count: number;
}

export interface DiscoveredSchedule {
  payee: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  amount: number;
  recurrenceType: string;
  intervalDays: number;
  confidence: number;
  transactionCount: number;
  matchedTransactionCount: number;
}

const MIN_TRANSACTIONS = 3;
const AMOUNT_THRESHOLD_FRAC = 0.15;
const MAX_INTERVAL_CV = 0.25;

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length);
}

function computeIntervalStats(intervals: number[]): IntervalStats | null {
  if (intervals.length === 0) return null;
  const med = median(intervals);
  const avg = mean(intervals);
  const sd = stdDev(intervals, avg);
  return { median: med, mean: avg, stdDev: sd, count: intervals.length };
}

function classifyRecurrence(intervalDays: number): string {
  const targets: [number, string][] = [
    [7, "weekly"],
    [14, "biweekly"],
    [30, "monthly"],
    [91, "quarterly"],
    [365, "yearly"],
  ];
  let best = "monthly";
  let bestDiff = Infinity;
  for (const [days, label] of targets) {
    const diff = Math.abs(intervalDays - days);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return best;
}

function classifyInterval(intervals: number[]): {
  type: string;
  intervalDays: number;
  matchedCount: number;
} | null {
  const stats = computeIntervalStats(intervals);
  if (!stats || stats.count < 2) return null;
  const cv = stats.mean !== 0 ? stats.stdDev / stats.mean : 0;
  if (cv > MAX_INTERVAL_CV) return null;
  const type = classifyRecurrence(stats.median);
  const matchedCount = intervals.filter(
    (i) => Math.abs(i - stats.median) <= Math.max(stats.median * AMOUNT_THRESHOLD_FRAC, 2),
  ).length;
  return { type, intervalDays: Math.round(stats.median), matchedCount };
}

function amountConsistent(amounts: number[]): boolean {
  if (amounts.length < 2) return true;
  const avg = mean(amounts);
  if (avg === 0) return false;
  const threshold = Math.max(Math.abs(avg * AMOUNT_THRESHOLD_FRAC), 50);
  return amounts.every((a) => Math.abs(a - avg) <= threshold);
}

function getAmountMode(amounts: number[]): number {
  const freq = new Map<number, number>();
  for (const a of amounts) freq.set(a, (freq.get(a) ?? 0) + 1);
  let best = amounts[0];
  let bestCount = 0;
  for (const [amt, count] of freq) {
    if (count > bestCount) {
      bestCount = count;
      best = amt;
    }
  }
  return best;
}

function analyzeGroup(group: TransactionGroup): DiscoveredSchedule | null {
  const { transactions } = group;
  if (transactions.length < MIN_TRANSACTIONS) return null;

  const dates = transactions.map((t) => t.date);
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const diff = daysBetween(dates[i - 1], dates[i]);
    if (diff > 0 && diff <= 400) intervals.push(diff);
  }

  if (intervals.length < 2) return null;

  const intervalResult = classifyInterval(intervals);
  if (!intervalResult) return null;

  const amounts = transactions.map((t) => t.amount);
  if (!amountConsistent(amounts)) return null;

  const dominantAmount = getAmountMode(amounts);
  const uniquePayees = new Set(transactions.map((t) => t.payee)).size;
  if (uniquePayees !== 1) return null;

  const intervalCv =
    intervalResult.intervalDays > 0
      ? intervals.reduce((sum, i) => sum + Math.abs(i - intervalResult.intervalDays), 0) /
        intervals.length /
        intervalResult.intervalDays
      : 0;

  const amountSpread =
    amounts.length > 1
      ? (Math.max(...amounts) - Math.min(...amounts)) / Math.max(Math.abs(dominantAmount), 1)
      : 0;

  const txnScore = Math.min(transactions.length / 10, 1);
  const intervalScore = Math.max(1 - intervalCv * 2, 0);
  const amountScore = Math.max(1 - amountSpread * 3, 0);
  const matchRatio = intervalResult.matchedCount / intervals.length;

  const confidence = Math.round(
    (txnScore * 0.3 + intervalScore * 0.3 + amountScore * 0.2 + matchRatio * 0.2) * 100,
  );

  return {
    payee: group.payee,
    accountId: group.accountId,
    accountName: "",
    categoryId: transactions[0].categoryId,
    amount: dominantAmount,
    recurrenceType: intervalResult.type,
    intervalDays: intervalResult.intervalDays,
    confidence,
    transactionCount: transactions.length,
    matchedTransactionCount: intervalResult.matchedCount + 1,
  };
}

export async function discoverSchedules(db: Db): Promise<DiscoveredSchedule[]> {
  const rows = await db.all<{
    payee: string | null;
    account_id: string;
    amount: number;
    date: string;
    category_id: string | null;
  }>(
    sql`SELECT t.payee, t.account_id, t.amount, t.date, t.category_id
     FROM transactions t
     WHERE t.is_child = 0
       AND t.transfer_id IS NULL
       AND t.payee IS NOT NULL
       AND t.payee != ''
     ORDER BY t.payee, t.account_id, t.date ASC`,
  );

  const existingSchedules = await db.all<{
    payee_id: string | null;
    payee_name: string | null;
  }>(
    sql`SELECT s.payee_id, p.name as payee_name
     FROM schedules s
     LEFT JOIN payees p ON s.payee_id = p.id
     WHERE s.active = 1 AND s.completed = 0`,
  );
  const excludedPayees = new Set<string>();
  for (const sched of existingSchedules) {
    if (sched.payee_name) excludedPayees.add(sched.payee_name);
  }

  const accountNames = new Map<string, string>();
  const acctRows = await db.all<{ id: string; name: string }>(
    sql`SELECT id, name FROM accounts WHERE closed = 0`,
  );
  for (const r of acctRows) {
    accountNames.set(r.id, r.name);
  }

  const groups = new Map<string, TransactionGroup>();
  for (const r of rows) {
    const payee = r.payee ?? "";
    const accountId = r.account_id;
    if (excludedPayees.has(payee)) continue;
    const key = `${payee}||${accountId}`;
    let group = groups.get(key);
    if (!group) {
      group = { payee, accountId, transactions: [] };
      groups.set(key, group);
    }
    group.transactions.push({
      payee,
      accountId,
      amount: r.amount,
      date: r.date,
      categoryId: r.category_id,
    });
  }

  const discovered: DiscoveredSchedule[] = [];
  for (const group of groups.values()) {
    const result = analyzeGroup(group);
    if (result && result.confidence >= 40) {
      result.accountName = accountNames.get(result.accountId) ?? "";
      discovered.push(result);
    }
  }

  discovered.sort((a, b) => b.confidence - a.confidence);
  return discovered;
}
