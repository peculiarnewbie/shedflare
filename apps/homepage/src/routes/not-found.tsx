export default function NotFound() {
  return (
    <div
      class="home-layout"
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        "min-height": "100dvh",
        gap: "1rem",
      }}
    >
      <h1 class="name-heading">404</h1>
      <p style={{ color: "var(--text-secondary)" }}>Page not found</p>
      <a href="/" style={{ color: "var(--accent-hover)", "font-size": "var(--font-size-sm)" }}>
        Go home
      </a>
    </div>
  );
}
