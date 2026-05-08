/**
 * Schedules page — recurring transaction templates.
 */
import { createSignal, For, Show, createEffect } from "solid-js";
import { dispatch } from "../lib/pending-ops";

export default function SchedulesPage() {
  const [schedules, setSchedules] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [showForm, setShowForm] = createSignal(false);

  createEffect(() => {
    void loadSchedules();
  });

  async function loadSchedules() {
    try {
      const res = await fetch("/api/schedules");
      if (res.ok) {
        const data = await res.json() as any;
        setSchedules(data.schedules ?? []);
      }
    } catch {
      // Will work once sync is connected
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

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Schedules</h1>
        <button class="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
          + Add Schedule
        </button>
      </div>

      <Show when={showForm()}>
        <ScheduleForm onClose={() => setShowForm(false)} />
      </Show>

      <Show when={!loading()} fallback={<div class="loading">Loading schedules...</div>}>
        <Show
          when={schedules().length > 0}
          fallback={<div class="empty-state">No recurring schedules yet.</div>}
        >
          <div class="schedule-list">
            <For each={schedules()}>
              {(schedule) => (
                <div class="schedule-card">
                  <div class="schedule-info">
                    <div class="schedule-name">{schedule.name ?? "Unnamed"}</div>
                    <div class="schedule-meta">
                      {schedule.recurrenceRules && `${schedule.recurrenceRules.slice(0, 40)}...`}
                      {schedule.nextDate && ` · Next: ${schedule.nextDate}`}
                    </div>
                  </div>
                  <div class="schedule-actions">
                    <button class="btn btn-sm btn-ghost" onClick={() => handlePost(schedule.id)}>
                      Post
                    </button>
                    <button class="btn btn-sm btn-ghost" onClick={() => handleSkip(schedule.id)}>
                      Skip
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
      </Show>
    </div>
  );
}

function ScheduleForm(props: { onClose: () => void }) {
  const [name, setName] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [recurrence, setRecurrence] = createSignal("weekly");
  const [saving, setSaving] = createSignal(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name().trim()) return;

    setSaving(true);
    const parsedAmount = Math.round(parseFloat(amount() || "0") * 100);
    const rules = JSON.stringify({ type: recurrence });
    dispatch("create_schedule", {
      schedule: {
        name: name().trim(),
        amount: parsedAmount || null,
        recurrenceRules: rules,
        startDate: new Date().toISOString().slice(0, 10),
      },
    });
    setSaving(false);
    props.onClose();
  }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>New Schedule</h2>
          <button class="modal-close" onClick={props.onClose}>✕</button>
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
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" onClick={props.onClose}>Cancel</button>
            <button type="submit" class="btn btn-primary" disabled={saving()}>
              {saving() ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
