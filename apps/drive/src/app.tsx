import { MetaProvider, Title } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import "./app.css";
import Home from "./routes/index";
import PublicFiles from "./routes/public";

export default function App() {
  return (
    <MetaProvider>
      <Title>Shedflare Drive</Title>
      <Router>
        <Route path="/" component={Home} />
        <Route path="/public" component={PublicFiles} />
      </Router>
    </MetaProvider>
  );
}
