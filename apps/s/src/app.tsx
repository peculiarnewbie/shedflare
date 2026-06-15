import { MetaProvider, Title } from "@solidjs/meta";
import { Router, Route } from "@solidjs/router";
import { createContext, createEffect, createSignal, type JSX, useContext, Show } from "solid-js";
import { clearAuthHint, readAuthHint } from "@shedflare/auth-client/client";
import "./app.css";
import Dashboard from "./routes/index";
import NotFound from "./routes/not-found";

type Session = { email: string } | null;

type SessionContextValue = {
  session: () => Session;
  setSession: (value: Session) => void;
  loading: () => boolean;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function shouldAttemptAutoLogin() {
  return new URL(window.location.href).searchParams.get("error") !== "no_session";
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return value;
}

function SessionProvider(props: { children?: JSX.Element }) {
  // Seed from the auth hint so a known-signed-in user paints the app shell
  // immediately instead of the loading screen. The probe below reconciles.
  const hint = readAuthHint();
  const [session, setSession] = createSignal<Session>(hint ? { email: hint } : null);
  const [loading, setLoading] = createSignal(!hint);

  createEffect(() => {
    void (async () => {
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
      } finally {
        setLoading(false);
      }
    })();
  });

  return (
    <SessionContext.Provider
      value={{ session, setSession: setSession as (value: Session) => void, loading }}
    >
      {props.children}
    </SessionContext.Provider>
  );
}

function LoadingScreen() {
  return (
    <div class="loading-screen">
      <div class="loading-spinner" />
    </div>
  );
}

function AppLayout(props: { children?: JSX.Element }) {
  const sessionCtrl = useSession();

  return (
    <div class="app-shell">
      <header class="top-bar">
        <div class="top-bar-brand">
          <svg
            class="top-bar-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span>Links</span>
        </div>
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

function AuthenticatedApp() {
  const sessionCtrl = useSession();

  return (
    <Show when={!sessionCtrl.loading()} fallback={<LoadingScreen />}>
      <Show
        when={sessionCtrl.session()}
        fallback={
          <div class="session-overlay">
            <div class="session-overlay-card">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <h2>Link Shortener</h2>
              <p class="session-overlay-desc">Create and manage short links.</p>
              <a href="/api/auth/login" class="btn btn-primary">
                Sign in
              </a>
            </div>
          </div>
        }
      >
        <AppLayout>
          <Router>
            <Route path="/" component={Dashboard} />
            <Route path="*404" component={NotFound} />
          </Router>
        </AppLayout>
      </Show>
    </Show>
  );
}

export default function App() {
  return (
    <MetaProvider>
      <Title>Shedflare Links</Title>
      <SessionProvider>
        <AuthenticatedApp />
      </SessionProvider>
    </MetaProvider>
  );
}
