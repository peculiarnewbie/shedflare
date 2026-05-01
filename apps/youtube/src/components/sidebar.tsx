import { A, useLocation } from "@solidjs/router";
import { createMemo } from "solid-js";

function isActive(path: string, current: string) {
  if (path === "/") return current === "/";
  return current.startsWith(path);
}

export default function Sidebar(props: {
  wlCount: number;
  notifCount: number;
  onSync: () => void;
  syncing: boolean;
}) {
  const location = useLocation();
  const path = createMemo(() => location.pathname);

  return (
    <nav class="sidebar">
      <div class="sidebar-nav">
        <A href="/" classList={{ "sidebar-link": true, active: isActive("/", path()) }}>
          <svg
            class="sidebar-link-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Dashboard</span>
        </A>
        <A
          href="/watch-later"
          classList={{ "sidebar-link": true, active: isActive("/watch-later", path()) }}
        >
          <svg
            class="sidebar-link-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <polygon points="10,9 15,12 10,15" fill="currentColor" stroke="none" />
          </svg>
          <span>Watch Later</span>
          {props.wlCount > 0 && <span class="sidebar-badge muted">{props.wlCount}</span>}
        </A>
        <A
          href="/notifications"
          classList={{ "sidebar-link": true, active: isActive("/notifications", path()) }}
        >
          <svg
            class="sidebar-link-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span>Notifications</span>
          {props.notifCount > 0 && <span class="sidebar-badge">{props.notifCount}</span>}
        </A>
      </div>
      <div class="sidebar-bottom">
        <button class="sync-button" onClick={props.onSync} disabled={props.syncing}>
          <svg
            classList={{ "sidebar-link-icon": true, "sync-button-spin": props.syncing }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M21 12a9 9 0 1 1-9-9" />
            <path d="M21 3v5h-5" />
          </svg>
          {props.syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>
    </nav>
  );
}
