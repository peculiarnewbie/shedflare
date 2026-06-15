import { A } from "@solidjs/router";

export default function NotFound() {
  return (
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
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        </div>
        <h2>Page not found</h2>
        <p class="session-overlay-desc">The page you requested does not exist.</p>
        <A href="/" class="btn btn-primary">
          Go to Dashboard
        </A>
      </div>
    </div>
  );
}
