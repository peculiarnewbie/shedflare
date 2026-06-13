import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { useRoutines } from "../context";
import { DEFAULT_ROUTINE_COLOR, ROUTINE_COLORS } from "../colors";
import type { Routine } from "../types";

export default function RoutineModal(props: { routine?: Routine; onClose: () => void }) {
  const ctx = useRoutines();
  const editing = () => props.routine !== undefined;

  const [name, setName] = createSignal(props.routine?.name ?? "");
  const [duration, setDuration] = createSignal(props.routine?.durationMinutes ?? 30);
  const [color, setColor] = createSignal(props.routine?.color ?? DEFAULT_ROUTINE_COLOR);
  const [weekly, setWeekly] = createSignal((props.routine?.weeklyTarget ?? 0) > 0);
  const [target, setTarget] = createSignal(props.routine?.weeklyTarget || 3);

  onMount(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name().trim() || duration() <= 0) return;
    const input = {
      name: name().trim(),
      durationMinutes: duration(),
      color: color(),
      weeklyTarget: weekly() ? Math.min(7, Math.max(1, target())) : 0,
    };
    if (editing()) await ctx.updateRoutine(props.routine!.id, input);
    else await ctx.addRoutine(input);
    props.onClose();
  };

  return (
    <Portal>
      <div class="modal-backdrop" onClick={props.onClose}>
        <form
          class="modal"
          style={{ "--c": color() }}
          onClick={(e) => e.stopPropagation()}
          onSubmit={submit}
        >
          <h2 class="modal-title">{editing() ? "Edit routine" : "New routine"}</h2>

          <label class="field">
            <span class="field-label">Name</span>
            <input
              class="field-input"
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="e.g. Morning workout"
              autofocus
            />
          </label>

          <label class="field">
            <span class="field-label">Duration</span>
            <div class="field-inline">
              <input
                class="field-input field-num"
                type="number"
                min="1"
                value={duration()}
                onInput={(e) => setDuration(Number(e.currentTarget.value))}
              />
              <span class="field-unit">minutes</span>
            </div>
          </label>

          <div class="field">
            <span class="field-label">Cadence</span>
            <div class="segmented">
              <button type="button" classList={{ on: !weekly() }} onClick={() => setWeekly(false)}>
                Daily
              </button>
              <button type="button" classList={{ on: weekly() }} onClick={() => setWeekly(true)}>
                Weekly
              </button>
            </div>
            <Show
              when={weekly()}
              fallback={<p class="field-hint">Show it every day and tick it off whenever.</p>}
            >
              <div class="stepper-row">
                <span class="field-hint">Target</span>
                <div class="stepper">
                  <button type="button" onClick={() => setTarget((t) => Math.max(1, t - 1))}>
                    −
                  </button>
                  <span class="stepper-val">{target()}</span>
                  <button type="button" onClick={() => setTarget((t) => Math.min(7, t + 1))}>
                    +
                  </button>
                </div>
                <span class="field-hint">× per week</span>
              </div>
            </Show>
          </div>

          <div class="field">
            <span class="field-label">Color</span>
            <div class="swatches">
              <For each={ROUTINE_COLORS}>
                {(c) => (
                  <button
                    type="button"
                    class="swatch"
                    classList={{ active: color() === c }}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                    aria-label={`color ${c}`}
                  />
                )}
              </For>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn" onClick={props.onClose}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">
              {editing() ? "Save" : "Add routine"}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
