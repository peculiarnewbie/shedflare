import { Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { useRoutines } from "../context";
import { BUILD_INFO } from "../lib/build-info";

export default function TopBar() {
  const ctx = useRoutines();
  const loc = useLocation();

  return (
    <header class="topbar">
      <A href="/" class="topbar-brand">
        <span class="topbar-mark" />
        <span class="topbar-name">Routines</span>
      </A>

      <nav class="topbar-nav">
        <A href="/" class="topbar-link" classList={{ active: loc.pathname === "/" }} end>
          Today
        </A>
        <A
          href="/analytics"
          class="topbar-link"
          classList={{ active: loc.pathname === "/analytics" }}
        >
          Analytics
        </A>
      </nav>

      <Show when={ctx.userEmail()}>
        <div class="topbar-end">
          <span class="build-marker" title={BUILD_INFO.tooltip}>
            {BUILD_INFO.label}
          </span>
          <span class="topbar-email">{ctx.userEmail()}</span>
          <form method="post" action="/api/auth/logout">
            <button class="btn btn-ghost">Sign out</button>
          </form>
        </div>
      </Show>
    </header>
  );
}
