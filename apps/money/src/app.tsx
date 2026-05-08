import { MetaProvider, Title } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import { onMount } from "solid-js";
import { init } from "./lib/sync-adapter";
import { start } from "./lib/ws-connection";
import "./app.css";

// Lazy-load route components
import Dashboard from "./routes/index";
import BudgetPage from "./routes/budget";
import AccountsPage from "./routes/accounts";
import AccountPage from "./routes/account";
import ReportsPage from "./routes/reports";
import SchedulesPage from "./routes/schedules";
import PayeesPage from "./routes/payees";
import RulesPage from "./routes/rules";
import TagsPage from "./routes/tags";
import SettingsPage from "./routes/settings";
import Layout from "./components/layout";

export default function App() {
  onMount(() => {
    // Initialize sync: hydrate from offline cache, then connect WebSocket
    void init().then(() => start());
  });

  return (
    <MetaProvider>
      <Title>Shedflare Money</Title>
      <Router root={Layout}>
        <Route path="/" component={Dashboard} />
        <Route path="/budget" component={BudgetPage} />
        <Route path="/accounts" component={AccountsPage} />
        <Route path="/accounts/:id" component={AccountPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/schedules" component={SchedulesPage} />
        <Route path="/payees" component={PayeesPage} />
        <Route path="/rules" component={RulesPage} />
        <Route path="/tags" component={TagsPage} />
        <Route path="/settings" component={SettingsPage} />
      </Router>
    </MetaProvider>
  );
}
