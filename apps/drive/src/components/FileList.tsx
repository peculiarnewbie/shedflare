import { For, Show } from "solid-js";
import { useDrive } from "../context";
import FileRow from "./FileRow";
import ShimmerSkeleton from "./ShimmerSkeleton";
import EmptyState from "./EmptyState";

export default function FileList() {
  const ctx = useDrive();

  return (
    <div class="file-list-wrap" classList={{ "has-right-sidebar": !!ctx.selectedFileId() }}>
      <div class="file-list-header">
        <div class="col-checkbox" />
        <div class="col-type" />
        <button
          class="col-name"
          classList={{ active: ctx.sortBy() === "name" }}
          onClick={() => {
            if (ctx.sortBy() === "name")
              ctx.setSortOrder(ctx.sortOrder() === "asc" ? "desc" : "asc");
            else {
              ctx.setSortBy("name");
              ctx.setSortOrder("asc");
            }
          }}
        >
          Name
          <Show when={ctx.sortBy() === "name"}>
            <span class="sort-arrow">{ctx.sortOrder() === "asc" ? "▲" : "▼"}</span>
          </Show>
        </button>
        <div class="col-tags">Tags</div>
        <button
          class="col-size"
          classList={{ active: ctx.sortBy() === "size" }}
          onClick={() => {
            if (ctx.sortBy() === "size")
              ctx.setSortOrder(ctx.sortOrder() === "asc" ? "desc" : "asc");
            else {
              ctx.setSortBy("size");
              ctx.setSortOrder("desc");
            }
          }}
        >
          Size
          <Show when={ctx.sortBy() === "size"}>
            <span class="sort-arrow">{ctx.sortOrder() === "asc" ? "▲" : "▼"}</span>
          </Show>
        </button>
        <button
          class="col-date"
          classList={{ active: ctx.sortBy() === "date" }}
          onClick={() => {
            if (ctx.sortBy() === "date")
              ctx.setSortOrder(ctx.sortOrder() === "asc" ? "desc" : "asc");
            else {
              ctx.setSortBy("date");
              ctx.setSortOrder("desc");
            }
          }}
        >
          Date
          <Show when={ctx.sortBy() === "date"}>
            <span class="sort-arrow">{ctx.sortOrder() === "asc" ? "▲" : "▼"}</span>
          </Show>
        </button>
      </div>

      <Show
        when={ctx.sortedFiles().length > 0}
        fallback={
          <Show when={ctx.checkingSession() || false} fallback={<EmptyState />}>
            <ShimmerSkeleton />
          </Show>
        }
      >
        <For each={ctx.sortedFiles()}>
          {(file, index) => (
            <div style={{ "animation-delay": `${index() * 30}ms` }} class="file-reveal">
              <FileRow file={file} />
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
