import { useDrive } from "../context";

export default function SearchPanel() {
  const ctx = useDrive();

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
        value={ctx.search()}
        onInput={(e) => ctx.setSearch(e.currentTarget.value)}
        placeholder="Search files..."
      />
    </div>
  );
}
