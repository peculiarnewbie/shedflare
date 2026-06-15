import { ErrorBoundary } from "solid-js";
import { MetaProvider, Title } from "@solidjs/meta";
import { Router, Route } from "@solidjs/router";
import "./app.css";
import Home from "./routes/index";
import Forbidden from "./routes/forbidden";
import NotFound from "./routes/not-found";

export default function App() {
  return (
    <MetaProvider>
      <Title>shedflare chat</Title>
      <ErrorBoundary
        fallback={(error) => (
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              "align-items": "center",
              "justify-content": "center",
              height: "100dvh",
              padding: "2rem",
              "text-align": "center",
              color: "var(--text-muted)",
              background: "var(--bg-page)",
            }}
          >
            <h1 style={{ color: "var(--text-primary)" }}>shedflare chat</h1>
            <p>Something went wrong. Reload to try again.</p>
            <pre
              style={{
                "max-width": "100%",
                overflow: "auto",
                "white-space": "pre-wrap",
                "font-size": "0.75rem",
                opacity: 0.6,
                margin: "1rem 0 0 0",
              }}
            >
              {error?.message || String(error)}
            </pre>
          </div>
        )}
      >
        <Router>
          <Route path="/" component={Home} />
          <Route path="/forbidden" component={Forbidden} />
          <Route path="*path" component={NotFound} />
        </Router>
      </ErrorBoundary>
    </MetaProvider>
  );
}
