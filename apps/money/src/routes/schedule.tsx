/**
 * Schedule detail/edit page — /schedules/:id
 */
import { createSignal, Show, createEffect } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { dispatch } from "../lib/pending-ops";
import { useCurrency } from "../lib/currency";
import { usePrivacyMode } from "../lib/privacy";
import { useDateFormat } from "../lib/date-format";

export default function ScheduleDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fmt = useCurrency();
  const privacyBlur = usePrivacyMode();
  const df = useDateFormat();
  const [schedule, setSchedule] = createSignal<any>(null);
  const [loading, setLoading] = createSignal(true);
  const [editing, setEditing] = createSignal(false);
  const _removing = createSignal(false);

  const [name, setName] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [recurrence, setRecurrence] = createSignal("monthly");
  const [skipWeekend, setSkipWeekend] = createSignal(false);
  const [weekendSolveMode, setWeekendSolveMode] = createSignal("after");
  const [endMode, setEndMode] = createSignal("never");
  const [endOccurrences, setEndOccurrences] = createSignal(10);
  const [endDate, setEndDate] = createSignal("");

  createEffect(() => {
    void loadSchedule();
  });

  async function loadSchedule() {
    try {
      const res = await fetch(`/api/schedules/${params.id}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        const s = data.schedule;
        setSchedule(s);
        setName(s.name ?? "");
        setAmount(s.amount ? fmt().formatCentsInput(s.amount) : "");
        const config = parseConfig(s.recurrenceRules);
        setRecurrence(config.type ?? "monthly");
        setSkipWeekend(config.skipWeekend ?? false);
        setWeekendSolveMode(config.weekendSolveMode ?? "after");
        setEndMode(config.endMode ?? "never");
        setEndOccurrences(config.endOccurrences ?? 10);
        setEndDate(config.endDate ?? "");
      }
    } catch {
      // Will work once sync is connected
    } finally {
      setLoading(false);
    }
  }

  function parseConfig(rules: string): any {
    try {
      const parsed = JSON.parse(rules);
      return typeof parsed === "object" ? parsed : { type: parsed };
    } catch {
      return { type: "monthly" };
    }
  }

  function formatRecurrenceLabel(s: any): string {
    const cfg = parseConfig(s?.recurrenceRules ?? "{}");
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

  function formatEndCondition(s: any): string {
    const cfg = parseConfig(s?.recurrenceRules ?? "{}");
    if (cfg.endMode === "after_n_occurrences" && cfg.endOccurrences) {
      return `After ${cfg.endOccurrences} occurrences`;
    }
    if (cfg.endMode === "on_date" && cfg.endDate) {
      return `Until ${df().formatDate(cfg.endDate)}`;
    }
    return "Never ends";
  }

  function handleSave(e: Event) {
    e.preventDefault();
    const parsedAmount = Math.round(parseFloat(amount() || "0") * 100);
    const rules: any = { type: recurrence() };

    if (skipWeekend()) {
      rules.skipWeekend = true;
      rules.weekendSolveMode = weekendSolveMode();
    }
    if (endMode() !== "never") {
      rules.endMode = endMode();
      if (endMode() === "after_n_occurrences") rules.endOccurrences = endOccurrences();
      if (endMode() === "on_date") rules.endDate = endDate();
    }

    dispatch("update_schedule", {
      id: params.id,
      fields: {
        name: name().trim(),
        amount: parsedAmount || null,
        recurrenceRules: JSON.stringify(rules),
      },
    });

    setSchedule((prev: any) => ({
      ...prev,
      name: name().trim(),
      amount: parsedAmount || null,
      recurrenceRules: JSON.stringify(rules),
    }));
    setEditing(false);
  }

  function handlePost() {
    dispatch("post_schedule_transaction", { scheduleId: params.id });
  }

  function handleSkip() {
    dispatch("skip_schedule_date", { id: params.id });
  }

  function handleDelete() {
    dispatch("delete_schedule", { id: params.id });
    navigate("/schedules");
  }

  const [confirmDelete, setConfirmDelete] = createSignal(false);

  return (
    <div class="page">
      <div class="page-header">
        <button class="btn btn-ghost btn-sm" onClick={() => navigate("/schedules")}>
          &larr; Back
        </button>
        <h1 class="page-title">{schedule()?.name ?? "Schedule"}</h1>
      </div>

      <Show when={!loading()} fallback={<div class="loading">Loading schedule...</div>}>
        <Show when={schedule()} fallback={<div class="empty-state">Schedule not found.</div>}>
          <div class="schedule-detail-page">
            <Show
              when={editing()}
              fallback={
                <>
                  <div class="schedule-detail-field">
                    <label>Name</label>
                    <div class="value">{schedule()?.name ?? "Unnamed"}</div>
                  </div>
                  <div class="schedule-detail-field">
                    <label>Amount</label>
                    <div class={`value ${privacyBlur().blurIf(schedule()?.amount != null)}`}>
                      {schedule()?.amount != null ? fmt().formatCents(schedule()?.amount) : "—"}
                    </div>
                  </div>
                  <div class="schedule-detail-field">
                    <label>Frequency</label>
                    <div class="value">{formatRecurrenceLabel(schedule())}</div>
                  </div>
                  <div class="schedule-detail-field">
                    <label>End Condition</label>
                    <div class="value">{formatEndCondition(schedule())}</div>
                  </div>
                  <div class="schedule-detail-field">
                    <label>Account</label>
                    <div class="value">{schedule()?.account_name ?? "—"}</div>
                  </div>
                  <div class="schedule-detail-field">
                    <label>Payee</label>
                    <div class="value">{schedule()?.payee_name ?? "—"}</div>
                  </div>
                  <div class="schedule-detail-field">
                    <label>Category</label>
                    <div class="value">{schedule()?.category_name ?? "—"}</div>
                  </div>
                  <div class="schedule-detail-field">
                    <label>Next Date</label>
                    <div class="value">
                      {schedule()?.nextDate
                        ? df().formatDate(schedule().nextDate)
                        : schedule()?.next_date
                          ? df().formatDate(schedule().next_date)
                          : "—"}
                    </div>
                  </div>
                  <div class="schedule-detail-field">
                    <label>Status</label>
                    <div class="value">
                      {schedule()?.completed
                        ? "Completed"
                        : schedule()?.active === false
                          ? "Inactive"
                          : "Active"}
                    </div>
                  </div>

                  <div class="schedule-detail-actions">
                    <button class="btn btn-primary btn-sm" onClick={() => setEditing(true)}>
                      Edit
                    </button>
                    <button
                      class="btn btn-sm btn-ghost"
                      onClick={handlePost}
                      disabled={schedule()?.completed || schedule()?.active === false}
                    >
                      Post Now
                    </button>
                    <button class="btn btn-sm btn-ghost" onClick={handleSkip}>
                      Skip Next
                    </button>
                    <Show
                      when={confirmDelete()}
                      fallback={
                        <button class="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(true)}>
                          Delete
                        </button>
                      }
                    >
                      <button class="btn btn-sm btn-danger" onClick={handleDelete}>
                        Confirm Delete
                      </button>
                      <button class="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(false)}>
                        Cancel
                      </button>
                    </Show>
                  </div>
                </>
              }
            >
              <form onSubmit={handleSave}>
                <div class="form-group">
                  <label>Name</label>
                  <input
                    type="text"
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
                    step={fmt().code === "IDR" ? "1" : "0.01"}
                    placeholder="0"
                    value={amount()}
                    onInput={(e) => setAmount(e.currentTarget.value)}
                  />
                </div>
                <div class="form-group">
                  <label>Frequency</label>
                  <select
                    value={recurrence()}
                    onChange={(e) => setRecurrence(e.currentTarget.value)}
                  >
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
                    <span>Skip weekends</span>
                  </label>
                </div>
                <Show when={skipWeekend()}>
                  <div class="form-group">
                    <select
                      value={weekendSolveMode()}
                      onChange={(e) => setWeekendSolveMode(e.currentTarget.value)}
                    >
                      <option value="after">Move to Monday</option>
                      <option value="before">Move to Friday</option>
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
                  <button type="button" class="btn btn-ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button type="submit" class="btn btn-primary">
                    Save
                  </button>
                </div>
              </form>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}
