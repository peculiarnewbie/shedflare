import { BUILD_INFO } from "../lib/build-info";

export default function NotFound() {
  return (
    <main
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        height: "100dvh",
        padding: "2rem",
        "text-align": "center",
        color: "var(--text-secondary)",
        background: "var(--bg)",
      }}
    >
      <section
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "8px",
          "align-items": "center",
          "max-width": "420px",
          padding: "28px",
          border: "1px solid var(--line)",
          "border-radius": "var(--radius-lg)",
          background: "var(--panel)",
          "box-shadow": "var(--shadow)",
        }}
      >
        <p
          style={{
            "font-size": "0.75rem",
            "text-transform": "uppercase",
            "letter-spacing": "0.05em",
            color: "var(--text-secondary)",
            "font-weight": 500,
            margin: 0,
          }}
        >
          404
        </p>
        <h1
          style={{
            color: "var(--text)",
            "font-size": "1.3rem",
            "font-weight": 600,
            margin: 0,
          }}
        >
          Page not found
        </h1>
        <p style={{ margin: 0 }}>That page doesn't exist.</p>
        <p class="app-version" title={BUILD_INFO.tooltip} style={{ "margin-top": "4px" }}>
          {BUILD_INFO.label}
        </p>
      </section>
    </main>
  );
}
