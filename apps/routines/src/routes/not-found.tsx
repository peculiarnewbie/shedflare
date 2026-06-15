import { A } from "@solidjs/router";
import "../app.css";
import TopBar from "../components/TopBar";

export default function NotFound() {
  return (
    <div class="app">
      <TopBar />
      <main class="analytics">
        <div class="analytics-card reveal" style={{ "text-align": "center", padding: "64px 24px" }}>
          <p class="status-eyebrow">404</p>
          <h1 class="page-title" style={{ "margin-bottom": "12px" }}>
            Page not found
          </h1>
          <p style={{ color: "var(--text-dim)", "margin-bottom": "28px" }}>
            That route doesn’t exist in Routines.
          </p>
          <A href="/" class="btn btn-primary">
            Go to Today
          </A>
        </div>
      </main>
    </div>
  );
}
