import { Index, Show, createMemo } from "solid-js";
import { useRoutines } from "../context";
import type { Routine } from "../types";

export default function RoutineItem(props: { routine: Routine; onEdit: () => void }) {
  const ctx = useRoutines();

  const isWeekly = () => props.routine.weeklyTarget > 0;
  const completedToday = createMemo(() =>
    ctx.completions().some((c) => c.routineId === props.routine.id && c.completed),
  );
  const weekCount = createMemo(() => ctx.weekCounts()[props.routine.id] ?? 0);
  const satisfied = createMemo(() => isWeekly() && weekCount() >= props.routine.weeklyTarget);

  const remove = async (e: MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${props.routine.name}"?`)) await ctx.deleteRoutine(props.routine.id);
  };
  const edit = (e: MouseEvent) => {
    e.stopPropagation();
    props.onEdit();
  };

  return (
    <button
      type="button"
      class="tile"
      classList={{ done: completedToday(), satisfied: satisfied() }}
      style={{ "--c": props.routine.color }}
      onClick={() => void ctx.toggleCompletion(props.routine.id)}
    >
      <span class="tile-check">
        <Show when={completedToday()}>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="3.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </Show>
      </span>

      <span class="tile-body">
        <span class="tile-name">{props.routine.name}</span>
        <span class="tile-meta">
          {props.routine.durationMinutes} min
          <Show when={isWeekly()}>
            <span class="tile-cadence">· {props.routine.weeklyTarget}×/week</span>
          </Show>
        </span>

        <Show when={isWeekly()}>
          <span class="pips" classList={{ full: satisfied() }}>
            <Index each={Array(props.routine.weeklyTarget).fill(0)}>
              {(_, i) => <span class="pip" classList={{ on: i < weekCount() }} />}
            </Index>
            <span class="pips-label">
              <Show
                when={satisfied()}
                fallback={`${weekCount()}/${props.routine.weeklyTarget} this week`}
              >
                done this week ✓
              </Show>
            </span>
          </span>
        </Show>
      </span>

      <span class="tile-tools">
        <span class="tile-tool" role="button" onClick={edit} title="Edit">
          ✏️
        </span>
        <span class="tile-tool" role="button" onClick={remove} title="Delete">
          🗑️
        </span>
      </span>
    </button>
  );
}
