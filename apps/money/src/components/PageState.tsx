import { Switch, Match, type JSX } from "solid-js";

interface PageStateProps {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loadingMessage?: string;
  children: JSX.Element;
}

export function PageState(props: PageStateProps) {
  return (
    <Switch>
      <Match when={props.loading}>
        <div class="loading">{props.loadingMessage ?? "Loading..."}</div>
      </Match>
      <Match when={props.error}>
        <div class="empty-state">
          <p>Could not load data.</p>
          <p style={{ color: "var(--text-muted)", "font-size": "0.85rem" }}>{props.error}</p>
          <button class="btn btn-primary btn-sm" onClick={props.onRetry} style="margin-top:12px">
            Retry
          </button>
        </div>
      </Match>
      <Match when={true}>{props.children}</Match>
    </Switch>
  );
}
