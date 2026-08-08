import { createSignal, onCleanup } from "solid-js";
import { useDrive } from "../context";

export default function SearchPanel() {
  const ctx = useDrive();
  const [inputValue, setInputValue] = createSignal(ctx.search());
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => clearTimeout(searchTimer));

  function updateSearch(value: string) {
    setInputValue(value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => ctx.setSearch(value), 250);
  }

  return (
    <div class="search-panel">
      <svg
        class="search-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        value={inputValue()}
        onInput={(e) => updateSearch(e.currentTarget.value)}
        placeholder="Search files..."
      />
    </div>
  );
}
