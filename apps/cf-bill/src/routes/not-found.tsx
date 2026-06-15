import { A } from "@solidjs/router";

export default function NotFound() {
  return (
    <div class="not-found">
      <h1>404</h1>
      <p class="not-found-desc">This page doesn't exist.</p>
      <A href="/" class="btn btn-primary">
        Back to dashboard
      </A>
    </div>
  );
}
