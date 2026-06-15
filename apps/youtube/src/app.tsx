import { MetaProvider, Title } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import { createEffect, createSignal, Show } from "solid-js";
import type { JSX } from "solid-js";
import { clearAuthHint, readAuthHint } from "@shedflare/auth-client/client";
import "./app.css";
import { CountsProvider, SessionProvider, useCounts } from "./app-context";
import Sidebar from "./components/sidebar";
import TopBar from "./components/top-bar";
import Dashboard from "./routes/index";
import Notifications from "./routes/notifications";
import NotFound from "./routes/not-found";
import WatchLater from "./routes/watch-later";

type Session = { email: string } | null;

function shouldAttemptAutoLogin() {
  return new URL(window.location.href).searchParams.get("error") !== "no_session";
}

function createSessionValue() {
  // Seed from the auth hint so a known-signed-in user paints the app shell
  // immediately instead of the loading screen. The probe below reconciles.
  const hint = readAuthHint();
  const [session, setSession] = createSignal<Session>(hint ? { email: hint } : null);
  const [loading, setLoading] = createSignal(!hint);

  createEffect(async () => {
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const data = (await res.json()) as { user: { email: string } };
        setSession(data.user);
      } else if (res.status === 401) {
        // Probe contradicts the hint: drop it so it can't paint a stale shell.
        clearAuthHint();
        setSession(null);
        if (shouldAttemptAutoLogin()) {
          window.location.replace("/api/auth/login?auto=1");
          return;
        }
      }
    } catch {
      // leave session null
    } finally {
      setLoading(false);
    }
  });

  return { session, setSession, loading };
}

function LoadingScreen() {
  return (
    <div class="loading-screen">
      <div class="loading-spinner" />
    </div>
  );
}

function AppLayout(props: { children?: JSX.Element }) {
  const [syncedAt, setSyncedAt] = createSignal<string | null>(null);
  const counts = useCounts();

  const sync = async () => {
    setSyncedAt("syncing...");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) setSyncedAt(new Date().toISOString());
    } catch {
      setSyncedAt(null);
    }
  };

  return (
    <div class="app-shell">
      <TopBar syncedAt={syncedAt()} />
      <div class="app-body">
        <Sidebar
          wlCount={counts.wlCount() ?? 0}
          notifCount={counts.notifCount() ?? 0}
          onSync={sync}
          syncing={syncedAt() === "syncing..."}
        />
        <main class="main-content">{props.children}</main>
      </div>
    </div>
  );
}

export default function App() {
  const sessionCtrl = createSessionValue();

  return (
    <MetaProvider>
      <Title>Shedflare YouTube</Title>
      <SessionProvider value={sessionCtrl}>
        <CountsProvider>
          <Show when={!sessionCtrl.loading()} fallback={<LoadingScreen />}>
            <Show
              when={sessionCtrl.session()}
              fallback={
                <div class="session-overlay">
                  <div class="session-overlay-card">
                    <div class="session-overlay-icon">
                      <svg
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                      </svg>
                    </div>
                    <h2>Not signed in</h2>
                    <p class="session-overlay-desc">
                      Sign in with your Google account to access your YouTube dashboard.
                    </p>
                    <a href="/api/auth/login" class="btn btn-primary">
                      Sign in with Google
                    </a>
                  </div>
                </div>
              }
            >
              <Router root={AppLayout}>
                <Route path="/" component={Dashboard} />
                <Route path="/watch-later" component={WatchLater} />
                <Route path="/notifications" component={Notifications} />
                <Route path="*404" component={NotFound} />
              </Router>
            </Show>
          </Show>
        </CountsProvider>
      </SessionProvider>
    </MetaProvider>
  );
}
