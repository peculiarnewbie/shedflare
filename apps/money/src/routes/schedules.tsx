/**
 * Schedules page — recurring transaction templates.
 */
import { createSignal, For, Show, createEffect } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { dispatch } from "../lib/pending-ops";
import { api } from "../lib/api";
import { useCurrency } from "../lib/currency";
import { useDateFormat } from "../lib/date-format";
import { PageState } from "../components/PageState";

export default function SchedulesPage() {
  const navigate = useNavigate();
  const df = useDateFormat();
  const fmt = useCurrency();
  const [schedules, setSchedules] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [showForm, setShowForm] = createSignal(false);
  const [editingSchedule, setEditingSchedule] = createSignal<any>(null);
  const [showDiscover, setShowDiscover] = createSignal(false);

  createEffect(() => {
    void loadSchedules();
  });

  async function loadSchedules() {
    setError(null);
    try {
      const data = await api.schedules();
      setSchedules([...data.schedules]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }

  function handleDelete(id: string) {
    dispatch("delete_schedule", { id });
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  function handlePost(scheduleId: string) {
    dispatch("post_schedule_transaction", { scheduleId });
  }

  function handleSkip(id: string) {
    dispatch("skip_schedule_date", { id });
  }

  function handleEdit(schedule: any) {
    setEditingSchedule(schedule);
    setShowForm(true);
  }

  function handleFormClose() {
    setShowForm(false);
    setEditingSchedule(null);
  }

  function handleSaved(saved: any) {
    if (editingSchedule()) {
      setSchedules((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    }
    handleFormClose();
  }

  function parseRecurrenceConfig(rules: string): any {
    try {
      const parsed = JSON.parse(rules);
      return typeof parsed === "object" ? parsed : { type: parsed };
    } catch {
      console.warn("[schedules] failed to parse recurrence config");
      return { type: rules || "monthly" };
    }
  }

  function formatRecurrenceLabel(rules: string): string {
    const cfg = parseRecurrenceConfig(rules);
    const labels: Record<string, string> = {
      daily: "Daily",
      weekly: "Weekly",
      biweekly: "Bi-weekly",
      monthly: "Monthly",
      quarterly: "Quarterly",
      yearly: "Yearly",
    };
    let label = labels[cfg.type] ?? cfg.type;
    if (cfg.skipWeekend) {
      label += ` (${cfg.weekendSolveMode === "before" ? "before" : "after"} weekend)`;
    }
    return label;
  }

  function formatEndConditionFormatted(rules: string, fmtDate: (d: string) => string): string {
    const cfg = parseRecurrenceConfig(rules);
    if (
      (cfg.endMode === "after_n" || cfg.endMode === "after_n_occurrences") &&
      cfg.endOccurrences
    ) {
      return ` · Ends after ${cfg.endOccurrences} occurrences`;
    }
    if (cfg.endMode === "on_date" && cfg.endDate) {
      return ` · Ends ${fmtDate(cfg.endDate)}`;
    }
    return "";
  }

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Schedules</h1>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onClick={() => setShowDiscover(true)}>
            Discover
          </button>
          <button class="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            + Add Schedule
          </button>
        </div>
      </div>

      <Show when={showForm()}>
        <ScheduleForm
          schedule={editingSchedule()}
          onClose={handleFormClose}
          onSaved={handleSaved}
        />
      </Show>

      <Show when={showDiscover()}>
        <DiscoverModal
          fmt={fmt}
          df={df}
          onClose={() => setShowDiscover(false)}
          onCreateSchedule={(candidate) => {
            setShowDiscover(false);
            dispatch("create_schedule", {
              schedule: {
                name: candidate.payee,
                amount: candidate.amount || null,
                recurrenceRules: JSON.stringify({ type: candidate.recurrenceType }),
                startDate: new Date().toISOString().slice(0, 10),
              },
            });
          }}
        />
      </Show>

      <PageState
        loading={loading()}
        error={error()}
        onRetry={loadSchedules}
        loadingMessage="Loading schedules..."
      >
        <Show
          when={schedules().length > 0}
          fallback={<div class="empty-state">No recurring schedules yet.</div>}
        >
          <div class="schedule-list">
            <For each={schedules()}>
              {(schedule) => (
                <div class="schedule-card">
                  <div class="schedule-info">
                    <div
                      class="schedule-name"
                      onClick={() => navigate(`/schedules/${schedule.id}`)}
                      style={{ cursor: "pointer" }}
                    >
                      {schedule.name ?? "Unnamed"}
                    </div>
                    <div class="schedule-meta">
                      {schedule.recurrenceRules && formatRecurrenceLabel(schedule.recurrenceRules)}
                      {schedule.nextDate && ` · Next: ${df().formatDate(schedule.nextDate)}`}
                      {schedule.completed && ` · Completed`}
                      {schedule.recurrenceRules &&
                        formatEndConditionFormatted(schedule.recurrenceRules, (d) =>
                          df().formatDate(d),
                        )}
                    </div>
                  </div>
                  <div class="schedule-actions">
                    <button class="btn btn-sm btn-ghost" onClick={() => handlePost(schedule.id)}>
                      Post
                    </button>
                    <button class="btn btn-sm btn-ghost" onClick={() => handleSkip(schedule.id)}>
                      Skip
                    </button>
                    <button class="btn btn-sm btn-ghost" onClick={() => handleEdit(schedule)}>
                      Edit
                    </button>
                    <button class="btn btn-sm btn-ghost" onClick={() => handleDelete(schedule.id)}>
                      🗑️
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </PageState>
    </div>
  );
}

function ScheduleForm(props: {
  onClose: () => void;
  schedule?: any;
  onSaved?: (saved: any) => void;
}) {
  const fmt = useCurrency();
  const isEdit = () => !!props.schedule;
  const existing = () => props.schedule;

  function parseRecurrenceConfig(rules: string): any {
    try {
      const parsed = JSON.parse(rules);
      return typeof parsed === "object" ? parsed : { type: parsed };
    } catch {
      console.warn("[schedules] failed to parse recurrence config");
      return { type: rules || "monthly" };
    }
  }

  const config = () =>
    existing()?.recurrenceRules ? parseRecurrenceConfig(existing().recurrenceRules) : {};

  const [name, setName] = createSignal(existing()?.name ?? "");
  const [amount, setAmount] = createSignal(
    existing()?.amount ? fmt().formatCentsInput(existing().amount) : "",
  );
  const [recurrence, setRecurrence] = createSignal(config().type ?? "weekly");
  const [skipWeekend, setSkipWeekend] = createSignal(config().skipWeekend ?? false);
  const [weekendSolveMode, setWeekendSolveMode] = createSignal(
    config().weekendSolveMode ?? "after",
  );
  const [endMode, setEndMode] = createSignal(config().endMode ?? "never");
  const [endOccurrences, setEndOccurrences] = createSignal(config().endOccurrences ?? 10);
  const [endDate, setEndDate] = createSignal(config().endDate ?? "");
  const [saving, setSaving] = createSignal(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name().trim()) return;

    setSaving(true);
    const parsedAmount = Math.round(parseFloat(amount() || "0") * 100);
    const rules: any = { type: recurrence };

    if (skipWeekend()) {
      rules.skipWeekend = true;
      rules.weekendSolveMode = weekendSolveMode();
    }
    if (endMode() !== "never") {
      rules.endMode = endMode();
      if (endMode() === "after_n_occurrences") {
        rules.endOccurrences = endOccurrences();
      }
      if (endMode() === "on_date") {
        rules.endDate = endDate();
      }
    }

    const rulesJson = JSON.stringify(rules);
    const startDate = existing()?.startDate ?? new Date().toISOString().slice(0, 10);

    if (isEdit()) {
      dispatch("update_schedule", {
        id: existing().id,
        fields: {
          name: name().trim(),
          amount: parsedAmount || null,
          recurrenceRules: rulesJson,
          startDate,
        },
      });
    } else {
      dispatch("create_schedule", {
        schedule: {
          name: name().trim(),
          amount: parsedAmount || null,
          recurrenceRules: rulesJson,
          startDate,
        },
      });
    }

    setSaving(false);
    props.onSaved?.({
      ...existing(),
      name: name().trim(),
      amount: parsedAmount || null,
      recurrenceRules: rulesJson,
      startDate,
    });
  }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>{isEdit() ? "Edit Schedule" : "New Schedule"}</h2>
          <button class="modal-close" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div class="form-group">
            <label>Name</label>
            <input
              type="text"
              placeholder="e.g. Monthly Rent"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              required
              autofocus
            />
          </div>
          <div class="form-group">
            <label>Amount (optional)</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount()}
              onInput={(e) => setAmount(e.currentTarget.value)}
            />
          </div>
          <div class="form-group">
            <label>Frequency</label>
            <select value={recurrence()} onChange={(e) => setRecurrence(e.currentTarget.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-check">
              <input
                type="checkbox"
                checked={skipWeekend()}
                onChange={(e) => setSkipWeekend(e.currentTarget.checked)}
              />
              <span>Skip weekends (move to nearest weekday)</span>
            </label>
          </div>
          <Show when={skipWeekend()}>
            <div class="form-group">
              <select
                value={weekendSolveMode()}
                onChange={(e) => setWeekendSolveMode(e.currentTarget.value)}
              >
                <option value="after">Move to Monday (after)</option>
                <option value="before">Move to Friday (before)</option>
              </select>
            </div>
          </Show>

          <div class="form-group">
            <label>End condition</label>
            <select value={endMode()} onChange={(e) => setEndMode(e.currentTarget.value)}>
              <option value="never">Never ends</option>
              <option value="after_n_occurrences">After N occurrences</option>
              <option value="on_date">On specific date</option>
            </select>
          </div>
          <Show when={endMode() === "after_n_occurrences"}>
            <div class="form-group">
              <label>Occurrences</label>
              <input
                type="number"
                min="1"
                value={endOccurrences()}
                onInput={(e) => setEndOccurrences(parseInt(e.currentTarget.value) || 1)}
              />
            </div>
          </Show>
          <Show when={endMode() === "on_date"}>
            <div class="form-group">
              <label>End date</label>
              <input
                type="date"
                value={endDate()}
                onInput={(e) => setEndDate(e.currentTarget.value)}
              />
            </div>
          </Show>

          <div class="form-actions">
            <button type="button" class="btn btn-ghost" onClick={props.onClose}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" disabled={saving()}>
              {saving() ? "Saving..." : isEdit() ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DiscoverCandidate {
  payee: string;
  accountId: string;
  accountName: string;
  amount: number;
  recurrenceType: string;
  intervalDays: number;
  confidence: number;
  transactionCount: number;
  matchedTransactionCount: number;
}

function DiscoverModal(props: {
  fmt: ReturnType<typeof useCurrency>;
  df: ReturnType<typeof useDateFormat>;
  onClose: () => void;
  onCreateSchedule: (candidate: DiscoverCandidate) => void;
}) {
  const [candidates, setCandidates] = createSignal<DiscoverCandidate[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [created, setCreated] = createSignal<Set<string>>(new Set());

  createEffect(() => {
    void loadCandidates();
  });

  async function loadCandidates() {
    setError(null);
    try {
      const data = await api.schedulesDiscover();
      setCandidates((data.discovered ?? []) as DiscoverCandidate[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discover");
    } finally {
      setLoading(false);
    }
  }

  function handleCreate(candidate: DiscoverCandidate) {
    setCreated((prev) => new Set(prev).add(`${candidate.payee}||${candidate.accountId}`));
    props.onCreateSchedule(candidate);
  }

  function recurrenceLabel(type: string): string {
    const labels: Record<string, string> = {
      weekly: "Weekly",
      biweekly: "Bi-weekly",
      monthly: "Monthly",
      quarterly: "Quarterly",
      yearly: "Yearly",
    };
    return labels[type] ?? type;
  }

  function confidenceClass(conf: number): string {
    if (conf >= 80) return "confidence-high";
    if (conf >= 60) return "confidence-mid";
    return "confidence-low";
  }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Discover Recurring Transactions</h2>
          <button class="modal-close" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div class="modal-body">
          <Show when={loading()}>
            <p class="text-muted">Analyzing transaction history...</p>
          </Show>
          <Show when={error()}>
            <p class="text-danger">{error()}</p>
          </Show>
          <Show when={!loading() && !error() && candidates().length === 0}>
            <p class="text-muted">No recurring patterns detected. Add more transactions first.</p>
          </Show>
          <Show when={!loading() && !error() && candidates().length > 0}>
            <p class="text-muted" style="margin-bottom: 1rem">
              Found {candidates().length} recurring pattern{candidates().length !== 1 ? "s" : ""} in
              your transaction history.
            </p>
            <div class="discover-list">
              <For each={candidates()}>
                {(candidate) => {
                  const isCreated = () =>
                    created().has(`${candidate.payee}||${candidate.accountId}`);
                  return (
                    <div class="discover-card">
                      <div class="discover-info">
                        <div class="discover-payee">{candidate.payee}</div>
                        <div class="discover-meta">
                          {candidate.accountName && `${candidate.accountName} · `}
                          {props.fmt().formatCents(candidate.amount)} ·{" "}
                          {recurrenceLabel(candidate.recurrenceType)}
                        </div>
                        <div class="discover-stats">
                          <span class={`confidence-badge ${confidenceClass(candidate.confidence)}`}>
                            {candidate.confidence}% confidence
                          </span>
                          <span class="text-muted">
                            {candidate.matchedTransactionCount} of {candidate.transactionCount}{" "}
                            transactions matched
                          </span>
                        </div>
                      </div>
                      <button
                        class="btn btn-sm btn-primary"
                        onClick={() => handleCreate(candidate)}
                        disabled={isCreated()}
                      >
                        {isCreated() ? "Created" : "Create Schedule"}
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
