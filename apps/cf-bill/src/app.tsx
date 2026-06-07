import { MetaProvider, Title } from "@solidjs/meta";
import { createEffect, createSignal, type JSX, Show } from "solid-js";
import "./app.css";
import Dashboard from "./routes/index";

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
  const sessionCtrl = useSession();

  return (
    <div class="app-shell">
      <header class="top-bar">
        <div class="top-bar-brand">
          <div class="top-bar-brand-dot" />
          <span>CF Usage</span>
        </div>
        <div class="top-bar-separator" />
        <span class="top-bar-title">Estimated Usage vs Plan Limits</span>
        <div class="top-bar-right">
          <span class="top-bar-email">{sessionCtrl.session()?.email}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" class="btn btn-ghost btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main class="main-content">{props.children}</main>
    </div>
  );
}

export default function App() {
  const sessionCtrl = createSessionSignal();
  (globalThis as any).__shedflareSession = sessionCtrl;

  return (
    <MetaProvider>
      <Title>Shedflare CF Usage</Title>
      <Show when={!sessionCtrl.loading()}>
        <Show
          when={sessionCtrl.session()}
          fallback={
            <div class="session-overlay">
              <div class="session-overlay-card">
                <h2>CF Usage</h2>
                <p class="session-overlay-desc">
                  Cloudflare usage estimate vs plan limits dashboard.
                </p>
                <a href="/api/auth/login" class="btn btn-primary">
                  Sign in with Google
                </a>
              </div>
            </div>
          }
        >
          <AppLayout>
            <Dashboard />
          </AppLayout>
        </Show>
      </Show>
    </MetaProvider>
  );
}
