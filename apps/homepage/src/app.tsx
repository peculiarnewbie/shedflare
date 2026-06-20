import { MetaProvider } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import Home from "./routes/index";
import Projects from "./routes/projects";
import NotFound from "./routes/not-found";

export default function App() {
  return (
    <MetaProvider>
      <Router>
        <Route path="/" component={Home} />
        <Route path="/projects" component={Projects} />
        <Route path="*404" component={NotFound} />
      </Router>
    </MetaProvider>
  );
}
