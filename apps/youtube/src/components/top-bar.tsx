import { useLocation } from "@solidjs/router";
import { createMemo } from "solid-js";
import { BUILD_INFO } from "../lib/build-info";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/watch-later": "Watch Later",
  "/notifications": "Notifications",
};

export default function TopBar(props: { syncedAt: string | null }) {
  const location = useLocation();
  const title = createMemo(() => PAGE_TITLES[location.pathname] ?? "YouTube");
  const syncLabel = createMemo(() => {
    if (props.syncedAt === "syncing...") return "Syncing...";
    if (!props.syncedAt) return "";
    const diff = Date.now() - new Date(props.syncedAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Synced just now";
    if (mins === 1) return "Synced 1m ago";
    return `Synced ${mins}m ago`;
  });

  return (
    <header class="top-bar">
      <div class="top-bar-brand">
        <div class="top-bar-brand-dot" />
        Shedflare
      </div>
      <div class="top-bar-separator" />
      <span class="top-bar-title">{title()}</span>
      <span class="top-bar-sync">{syncLabel()}</span>
      <span class="build-marker" title={BUILD_INFO.tooltip}>
        {BUILD_INFO.label}
      </span>
    </header>
  );
}
