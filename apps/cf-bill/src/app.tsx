import { MetaProvider, Title } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import type { RouteSectionProps } from "@solidjs/router";
import {
  createContext,
  createEffect,
  createSignal,
  type Accessor,
  type JSX,
  type Setter,
  Show,
  useContext,
} from "solid-js";
import { clearAuthHint, readAuthHint } from "@shedflare/auth-client/client";
import "./app.css";
import { BUILD_INFO } from "./lib/build-info";
import Dashboard from "./routes/index";
import NotFound from "./routes/not-found";

type Session = { email: string } | null;

interface SessionCtrl {
  session: Accessor<Session>;
  setSession: Setter<Session>;
  loading: Accessor<boolean>;
}

const SessionContext = createContext<SessionCtrl | undefined>(undefined);

function shouldAttemptAutoLogin() {
  return new URL(window.location.href).searchParams.get("error") !== "no_session";
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionContext.Provider");
  }
  return ctx;
}

function createSessionSignal(): SessionCtrl {
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
      // ignore network/session errors and show the login state
    } finally {
      setLoading(false);
    }
  });

  return { session, setSession, loading };
}

function LoadingScreen() {
  return (
    <div class="loading-screen">
      <div class="loading-screen-inner">
        <div class="loading-screen-brand">
          <div class="loading-screen-brand-dot" />
          <span>CF Usage</span>
        </div>
        <div class="spinner" aria-label="Loading" />
      </div>
    </div>
  );
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
          <span class="build-marker" title={BUILD_INFO.tooltip}>
            {BUILD_INFO.label}
          </span>
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

function AuthenticatedLayout(props: RouteSectionProps) {
  return <AppLayout>{props.children}</AppLayout>;
}

function LoginOverlay() {
  return (
    <div class="session-overlay">
      <div class="session-overlay-card">
        <h2>CF Usage</h2>
        <p class="session-overlay-desc">Cloudflare usage estimate vs plan limits dashboard.</p>
        <a href="/api/auth/login" class="btn btn-primary">
          Sign in with Google
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const sessionCtrl = createSessionSignal();

  return (
    <MetaProvider>
      <Title>Shedflare CF Usage</Title>
      <SessionContext.Provider value={sessionCtrl}>
        <Show when={!sessionCtrl.loading()} fallback={<LoadingScreen />}>
          <Show when={sessionCtrl.session()} fallback={<LoginOverlay />}>
            <Router root={AuthenticatedLayout}>
              <Route path="/" component={Dashboard} />
              <Route path="*404" component={NotFound} />
            </Router>
          </Show>
        </Show>
      </SessionContext.Provider>
    </MetaProvider>
  );
}
