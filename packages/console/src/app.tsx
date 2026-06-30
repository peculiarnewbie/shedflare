import { Index, Show } from "solid-js";
import { Route, Router } from "@solidjs/router";
import type { RouteSectionProps } from "@solidjs/router";
import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import "./app.css";
import Overview from "./routes/overview";
import Apps from "./routes/apps";
import AppDetail from "./routes/app-detail";
import Usage from "./routes/usage";
import ConfigPage from "./routes/config";
import { StageProvider, useStage } from "./lib/stage-context";

function StageSelector() {
  const { selectedStage, setStage, availableStages } = useStage();
  const stageList = () => availableStages()?.stages ?? [];
  const showDiscovered = () => stageList().length > 0;

  return (
    <div class="sidebar-section">
      <div class="sidebar-section-label">Deploy stage</div>
      <Show
        when={!availableStages.loading}
        fallback={<div class="sidebar-section-skeleton">Loading…</div>}
      >
        <select
          class="stage-select"
          value={selectedStage()}
          onChange={(e) => setStage(e.currentTarget.value)}
        >
          <Show when={showDiscovered()}>
            <Index each={stageList()}>
              {(stage) => <option value={stage()}>{stage()}</option>}
            </Index>
            <option disabled>───</option>
          </Show>
          <option value={selectedStage()}>
            {showDiscovered() ? `${selectedStage()} (current)` : selectedStage()}
          </option>
        </select>
      </Show>
    </div>
  );
}

function Shell(props: { children?: JSX.Element }) {
  return (
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="sidebar-brand-dot" />
          <span>Shedflare</span>
        </div>
        <nav class="sidebar-nav">
          <A href="/" class="nav-link" activeClass="active" end>
            Overview
          </A>
          <A href="/apps" class="nav-link" activeClass="active">
            Apps
          </A>
          <A href="/usage" class="nav-link" activeClass="active">
            Usage
          </A>
          <A href="/config" class="nav-link" activeClass="active">
            Config
          </A>
        </nav>
        <StageSelector />
        <p class="sidebar-footnote">Local console — CF token stays on your machine.</p>
      </aside>
      <main class="main-content">{props.children}</main>
    </div>
  );
}

function Layout(props: RouteSectionProps) {
  return <Shell>{props.children}</Shell>;
}

export default function App() {
  return (
    <StageProvider>
      <Router root={Layout}>
        <Route path="/" component={Overview} />
        <Route path="/apps" component={Apps} />
        <Route path="/apps/:id" component={AppDetail} />
        <Route path="/usage" component={Usage} />
        <Route path="/config" component={ConfigPage} />
      </Router>
    </StageProvider>
  );
}
