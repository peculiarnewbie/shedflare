import { MetaProvider, Title } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import { createEffect, createSignal, JSX, Show, Suspense } from "solid-js";
import "./app.css";
import Sidebar from "./components/sidebar";
import TopBar from "./components/top-bar";
import Dashboard from "./routes/index";
import WatchLater from "./routes/watch-later";
import Notifications from "./routes/notifications";

type Session = { email: string } | null;

function shouldAttemptAutoLogin() {
  return new URL(window.location.href).searchParams.get("error") !== "no_session";
}

export function useSession() {
  return (globalThis as any).__shedflareSession as ReturnType<typeof createSessionSignal>;
}

function createSessionSignal() {
  const [session, setSession] = createSignal<Session>(null);
  const [loading, setLoading] = createSignal(true);

  createEffect(async () => {
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const data = (await res.json()) as { user: { email: string } };
        setSession(data.user);
      } else if (res.status === 401 && shouldAttemptAutoLogin()) {
        window.location.replace("/api/auth/login?auto=1");
        return;
      }
    } catch {
    } finally {
      setLoading(false);
    }
  });

  return { session, setSession, loading };
}

function AppLayout(props: { children?: JSX.Element }) {
  const [syncedAt, setSyncedAt] = createSignal<string | null>(null);
  const [wlCount] = createSignal(0);
  const [notifCount] = createSignal(0);

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
          wlCount={wlCount()}
          notifCount={notifCount()}
          onSync={sync}
          syncing={syncedAt() === "syncing..."}
        />
        <main class="main-content">
          <Suspense fallback={<div class="loading-spinner" />}>{props.children}</Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const sessionCtrl = createSessionSignal();
  (globalThis as any).__shedflareSession = sessionCtrl;

  return (
    <MetaProvider>
      <Title>Shedflare YouTube</Title>
      <Show when={!sessionCtrl.loading()}>
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
          </Router>
        </Show>
      </Show>
    </MetaProvider>
  );
}
