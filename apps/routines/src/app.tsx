import { MetaProvider, Title } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import "./app.css";
import { RoutinesProvider } from "./context";
import Home from "./routes/index";
import Analytics from "./routes/analytics";
import NotFound from "./routes/not-found";

export default function App() {
  return (
    <MetaProvider>
      <Title>Shedflare Routines</Title>
      <RoutinesProvider>
        <Router>
          <Route path="/" component={Home} />
          <Route path="/analytics" component={Analytics} />
          <Route path="*404" component={NotFound} />
        </Router>
      </RoutinesProvider>
    </MetaProvider>
  );
}
