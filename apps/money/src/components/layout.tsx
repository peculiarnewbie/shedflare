import { createSignal, Show, For } from "solid-js";
import { A, useLocation, useNavigate, type RouteSectionProps } from "@solidjs/router";
import { isConnected } from "../lib/ws-connection";

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Dashboard", icon: "📊" },
  { path: "/budget", label: "Budget", icon: "💰" },
  { path: "/categories", label: "Categories", icon: "📁" },
  { path: "/accounts", label: "Accounts", icon: "🏦" },
  { path: "/reports", label: "Reports", icon: "📈" },
  { path: "/schedules", label: "Schedules", icon: "🔄" },
  { path: "/payees", label: "Payees", icon: "👤" },
  { path: "/rules", label: "Rules", icon: "⚙️" },
  { path: "/tags", label: "Tags", icon: "🏷️" },
  { path: "/settings", label: "Settings", icon: "🔧" },
];

const MOBILE_BOTTOM_NAV: NavItem[] = [
  { path: "/", label: "Home", icon: "📊" },
  { path: "/budget", label: "Budget", icon: "💰" },
  { path: "/accounts", label: "Accts", icon: "🏦" },
  { path: "/reports", label: "Charts", icon: "📈" },
  { path: "/more", label: "More", icon: "⋯" },
];

// ---------------------------------------------------------------------------
// Layout component
// ---------------------------------------------------------------------------

export default function Layout(props: RouteSectionProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [showMobileMenu, setShowMobileMenu] = createSignal(false);

  const isActive = (path: string) => location.pathname === path;

  // Current month for header
  const [currentMonth, setCurrentMonth] = createSignal(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  return (
    <div class="app-layout">
      {/* Sidebar (desktop) */}
      <aside class="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-logo">💰</span>
          <span class="sidebar-title">Money</span>
        </div>
        <nav class="sidebar-nav">
          <For each={NAV_ITEMS}>
            {(item) => (
              <A href={item.path} class="nav-item" classList={{ active: isActive(item.path) }}>
                <span class="nav-icon">{item.icon}</span>
                <span class="nav-label">{item.label}</span>
              </A>
            )}
          </For>
        </nav>
        <div class="sidebar-footer">
          <div class="sync-indicator" classList={{ connected: isConnected() }}>
            <span class="sync-dot" />
            <span class="sync-text">{isConnected() ? "Synced" : "Offline"}</span>
          </div>
          <button
            class="btn btn-ghost btn-sm"
            style="width:100%"
            onClick={async () => {
              try {
                await fetch("/api/auth/logout", {
                  method: "POST",
                  credentials: "same-origin",
                });
              } finally {
                // Clear local sync state so the next login starts fresh
                if (typeof localStorage !== "undefined") {
                  localStorage.removeItem("money.clientId");
                  localStorage.removeItem("money.lastServerSeq");
                  localStorage.removeItem("money.pendingOps");
                }
                window.location.href = "/";
              }
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header class="mobile-top-bar">
        <button class="btn btn-icon btn-ghost" onClick={() => setShowMobileMenu(!showMobileMenu())}>
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:24px;height:24px">
            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
          </svg>
        </button>
        <span class="mobile-title">Shedflare Money</span>
        <div class="sync-indicator" classList={{ connected: isConnected() }}>
          <span class="sync-dot" />
        </div>
      </header>

      {/* Mobile dropdown menu */}
      <Show when={showMobileMenu()}>
        <div class="mobile-menu-overlay" onClick={() => setShowMobileMenu(false)}>
          <div class="mobile-menu" onClick={(e) => e.stopPropagation()}>
            <For each={NAV_ITEMS}>
              {(item) => (
                <button
                  class="mobile-menu-item"
                  classList={{ active: isActive(item.path) }}
                  onClick={() => {
                    navigate(item.path);
                    setShowMobileMenu(false);
                  }}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Main content */}
      <main class="main-content">{props.children as any}</main>

      {/* Mobile bottom tab bar */}
      <nav class="bottom-tab-bar">
        <For each={MOBILE_BOTTOM_NAV}>
          {(item) => (
            <button
              class="bottom-tab"
              classList={{ active: isActive(item.path) }}
              onClick={() => {
                if (item.path === "/more") {
                  setShowMobileMenu(true);
                  return;
                }
                navigate(item.path);
              }}
            >
              <span class="tab-icon">{item.icon}</span>
              <span class="tab-label">{item.label}</span>
            </button>
          )}
        </For>
      </nav>
    </div>
  );
}
