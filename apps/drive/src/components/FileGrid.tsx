import { For, Show } from "solid-js";
import { useDrive } from "../context";
import FileCard from "./FileCard";
import ShimmerSkeleton from "./ShimmerSkeleton";
import EmptyState from "./EmptyState";

export default function FileGrid() {
  const ctx = useDrive();

  return (
    <div class="file-grid" classList={{ "has-right-sidebar": !!ctx.selectedFileId() }}>
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
            <div style={{ "animation-delay": `${index() * 40}ms` }} class="file-reveal">
              <FileCard file={file} />
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
