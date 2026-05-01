import { JSX } from "solid-js";

export default function StatCard(props: {
  value: string | number;
  label: string;
  sub?: string;
  accent: "accent" | "blue" | "green";
  icon?: JSX.Element;
}) {
  return (
    <div class="stat-card">
      {props.icon && <div style={{ color: `var(--${props.accent})` }}>{props.icon}</div>}
      <div
        classList={{
          "stat-card-value": true,
          [props.accent === "accent" ? "watch-later" : "notifications"]: true,
        }}
      >
        {props.value}
      </div>
      <div class="stat-card-label">{props.label}</div>
      {props.sub && <div class="stat-card-sub">{props.sub}</div>}
    </div>
  );
}
