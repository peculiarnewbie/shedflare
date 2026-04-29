import { For, Show } from "solid-js";
import { useDrive } from "../context";
import type { SortBy } from "../types";

export default function ViewToolbar() {
  const ctx = useDrive();
  const selCount = () => ctx.selectedFileIds().size;

  const sortOptions = [
    { value: "name" as const, label: "Name" },
    { value: "date" as const, label: "Date" },
    { value: "size" as const, label: "Size" },
  ];

  return (
    <div class="view-toolbar">
      <div class="view-toolbar-left">
        <div class="segmented-control">
          <button
            classList={{ active: ctx.viewMode() === "grid" }}
            onClick={() => ctx.setViewMode("grid")}
            title="Grid view"
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="1" width="6" height="6" rx="1" />
              <rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" />
              <rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
          </button>
          <button
            classList={{ active: ctx.viewMode() === "list" }}
            onClick={() => ctx.setViewMode("list")}
            title="List view"
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="1" width="14" height="3" rx="1" />
              <rect x="1" y="6.5" width="14" height="3" rx="1" />
              <rect x="1" y="12" width="14" height="3" rx="1" />
            </svg>
          </button>
        </div>

        <div class="sort-control">
          <select
            value={ctx.sortBy()}
            onChange={(e) => ctx.setSortBy(e.currentTarget.value as SortBy)}
          >
            <For each={sortOptions}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
          </select>
          <button
            class="sort-order-btn"
            onClick={() => ctx.setSortOrder(ctx.sortOrder() === "asc" ? "desc" : "asc")}
            title={ctx.sortOrder() === "asc" ? "Ascending" : "Descending"}
          >
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              classList={{ flipped: ctx.sortOrder() === "asc" }}
            >
              <path d="M8 2.5a.5.5 0 0 1 .5.5v9.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 12.793V3a.5.5 0 0 1 .5-.5z" />
            </svg>
          </button>
        </div>
      </div>

      <Show when={selCount() > 0}>
        <div class="batch-toolbar">
          <span class="batch-count">{selCount()} selected</span>
          <button class="btn" onClick={ctx.downloadSelected}>
            Download
          </button>
          <button class="btn btn-danger" onClick={ctx.removeSelected}>
            Delete
          </button>
          <button class="btn" onClick={ctx.clearSelection}>
            Clear
          </button>
        </div>
      </Show>
    </div>
  );
}
