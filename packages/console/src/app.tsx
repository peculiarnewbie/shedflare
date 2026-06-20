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
    <Router root={Layout}>
      <Route path="/" component={Overview} />
      <Route path="/apps" component={Apps} />
      <Route path="/apps/:id" component={AppDetail} />
      <Route path="/usage" component={Usage} />
      <Route path="/config" component={ConfigPage} />
    </Router>
  );
}
