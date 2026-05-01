import { MetaProvider, Title } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import "./app.css";
import Home from "./routes/index";

export default function App() {
  return (
    <MetaProvider>
      <Title>Shedflare Money</Title>
      <Router>
        <Route path="/" component={Home} />
      </Router>
    </MetaProvider>
  );
}
