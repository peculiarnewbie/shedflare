import { For, Show, createMemo, createSignal } from "solid-js";
import { useRoutines } from "../context";
import RoutineItem from "./RoutineItem";
import RoutineModal from "./RoutineModal";
import type { Routine } from "../types";

export default function RoutinesList() {
  const ctx = useRoutines();
  // null = closed; {} = add; { routine } = edit.
  const [modal, setModal] = createSignal<{ routine?: Routine } | null>(null);

  const daily = createMemo(() => ctx.routines().filter((r) => r.weeklyTarget === 0));
  const weekly = createMemo(() => ctx.routines().filter((r) => r.weeklyTarget > 0));
  const hasBoth = createMemo(() => daily().length > 0 && weekly().length > 0);

  return (
    <div class="routines">
      <div class="routines-head">
        <div>
          <h2 class="section-title">Routines</h2>
          <span class="routines-hint">tap a card to mark it done</span>
        </div>
        <button class="btn btn-primary" onClick={() => setModal({})}>
          + New routine
        </button>
      </div>

      <Show
        when={ctx.routines().length > 0}
        fallback={<p class="routines-empty">No routines yet — add the things you want to do.</p>}
      >
        <Show when={daily().length > 0}>
          <Show when={hasBoth()}>
            <h3 class="routines-group">Daily</h3>
          </Show>
          <div class="routines-grid">
            <For each={daily()}>
              {(r) => <RoutineItem routine={r} onEdit={() => setModal({ routine: r })} />}
            </For>
          </div>
        </Show>

        <Show when={weekly().length > 0}>
          <h3 class="routines-group">This week</h3>
          <div class="routines-grid">
            <For each={weekly()}>
              {(r) => <RoutineItem routine={r} onEdit={() => setModal({ routine: r })} />}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={modal()}>
        <RoutineModal routine={modal()!.routine} onClose={() => setModal(null)} />
      </Show>
    </div>
  );
}
