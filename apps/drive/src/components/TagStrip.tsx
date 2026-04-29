import { For } from "solid-js";
import { useDrive } from "../context";

export default function TagStrip() {
  const ctx = useDrive();

  return (
    <div class="tag-strip">
      <button
        classList={{ active: ctx.selectedTag() === "" }}
        onClick={() => ctx.setSelectedTag("")}
      >
        All
      </button>
      <For each={ctx.tags()}>
        {(tag) => (
          <button
            classList={{ active: ctx.selectedTag() === tag.name }}
            onClick={() => ctx.setSelectedTag(tag.name)}
          >
            {tag.name} <span>{tag.count}</span>
          </button>
        )}
      </For>
    </div>
  );
}
