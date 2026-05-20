import { MetaProvider, Title } from "@solidjs/meta";
import { A, Route, Router } from "@solidjs/router";
import { For, Show } from "solid-js";
import "./styles.css";
import { apps, guides } from "./content";

function Shell(props: { children: unknown }) {
  return (
    <>
      <header class="topbar">
        <A class="brand" href="/" aria-label="Shedflare home">
          <span class="brand-mark">sf</span>
          <span>Shedflare</span>
        </A>
        <nav class="nav" aria-label="Main navigation">
          <A href="/docs">Docs</A>
          <A href="/docs/apps">Apps</A>
          <A href="/docs/deployment">Deploy</A>
          <a href="https://github.com/peculiarnewbie/shedflare" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>
      {props.children}
      <footer class="footer">
        <p>
          Shedflare is project-owned infrastructure for people who want personal tools in their own
          Cloudflare account.
        </p>
      </footer>
    </>
  );
}

function Home() {
  return (
    <Shell>
      <main>
        <section class="hero">
          <div class="hero-copy">
            <p class="eyebrow">Self-hosted, but cloud-native</p>
            <h1>Personal utility apps that live in your Cloudflare cloud.</h1>
            <p class="lede">
              Shedflare is a suite of private productivity tools deployed into your own Cloudflare
              account. You may not control the hardware, but you control the Workers, resources,
              data boundary, secrets, and deployment lifecycle.
            </p>
            <div class="actions">
              <A class="button primary" href="/docs">
                Read the docs
              </A>
              <A class="button secondary" href="/docs/apps">
                Explore apps
              </A>
            </div>
          </div>
          <div class="cloud-card" aria-label="Shedflare deployment model diagram">
            <div class="orbit orbit-one" />
            <div class="orbit orbit-two" />
            <div class="core">Your Cloudflare Account</div>
            <div class="node node-a">Workers</div>
            <div class="node node-b">R2</div>
            <div class="node node-c">D1</div>
            <div class="node node-d">DO</div>
          </div>
        </section>

        <section class="statement">
          <p>
            This is not a hosted SaaS trying to become your landlord. It is a repo, a deployment
            model, and a set of owner-operated apps for the Cloudflare platform.
          </p>
        </section>

        <section class="grid-section">
          <div class="section-heading">
            <p class="eyebrow">The suite</p>
            <h2>Tools with clear resource boundaries.</h2>
          </div>
          <div class="app-grid">
            <For each={apps}>{(app) => <AppCard app={app} />}</For>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function AppCard(props: { app: (typeof apps)[number] }) {
  return (
    <A class="app-card" href={`/docs/apps/${props.app.id}`}>
      <span>{props.app.resources}</span>
      <h3>{props.app.name}</h3>
      <p>{props.app.summary}</p>
    </A>
  );
}

function Docs(props: { page?: string }) {
  const app = () => apps.find((item) => item.id === props.page);

  return (
    <Shell>
      <main class="docs-layout">
        <aside class="docs-sidebar">
          <A href="/docs">Start</A>
          <A href="/docs/deployment">Deployment</A>
          <A href="/docs/apps">Apps</A>
          <For each={apps}>{(item) => <A href={`/docs/apps/${item.id}`}>{item.name}</A>}</For>
        </aside>
        <article class="docs-page">
          <Show
            when={props.page === "deployment"}
            fallback={props.page ? <AppDoc app={app()} /> : <DocsIndex />}
          >
            <DeploymentDoc />
          </Show>
        </article>
      </main>
    </Shell>
  );
}

function DocsIndex() {
  return (
    <>
      <p class="eyebrow">Documentation</p>
      <h1>Run personal software inside a cloud account you control.</h1>
      <p class="doc-lede">
        Shedflare’s model is single-owner self-hosting on Cloudflare. The suite is deployed from
        source into your account, with Alchemy managing the Workers and platform resources.
      </p>
      <div class="guide-list">
        <For each={guides}>{(guide) => <GuideCard guide={guide} />}</For>
      </div>
    </>
  );
}

function DeploymentDoc() {
  return (
    <>
      <p class="eyebrow">Deployment</p>
      <h1>Alchemy is the lifecycle.</h1>
      <p class="doc-lede">
        User-deployable apps live under <code>apps/*</code>. Each app has an Alchemy stack that
        declares its Worker, assets, bindings, and Cloudflare resources.
      </p>
      <div class="steps">
        <p>
          <strong>1.</strong> Create <code>shedflare.config.jsonc</code> from the example template.
        </p>
        <p>
          <strong>2.</strong> Fill in domain, owner email, app subdomains, and required vars.
        </p>
        <p>
          <strong>3.</strong> Deploy auth first, or use the root stack to wire auth into child apps.
        </p>
        <p>
          <strong>4.</strong> Run <code>pnpm deploy</code> for the suite or{" "}
          <code>pnpm deploy:&lt;app&gt;</code> for one app.
        </p>
      </div>
      <p>
        This website is different: it lives in <code>site/</code> because it is Shedflare project
        infrastructure, not something every owner deploys as part of their private suite.
      </p>
    </>
  );
}

function AppDoc(props: { app?: (typeof apps)[number] }) {
  return (
    <Show when={props.app} fallback={<DocsIndex />}>
      {(app) => (
        <>
          <p class="eyebrow">App</p>
          <h1>Shedflare {app().name}</h1>
          <p class="doc-lede">{app().summary}</p>
          <dl class="facts">
            <div>
              <dt>Cloudflare resources</dt>
              <dd>{app().resources}</dd>
            </div>
            <div>
              <dt>Intent</dt>
              <dd>{app().notes}</dd>
            </div>
          </dl>
          <p>
            This app is part of the owner-deployed suite and is protected by Shedflare Auth when
            deployed for real use.
          </p>
        </>
      )}
    </Show>
  );
}

function GuideCard(props: { guide: (typeof guides)[number] }) {
  return (
    <section class="guide-card">
      <h2>{props.guide.title}</h2>
      <p>{props.guide.body}</p>
    </section>
  );
}

export default function App() {
  return (
    <MetaProvider>
      <Title>Shedflare</Title>
      <Router>
        <Route path="/" component={Home} />
        <Route path="/docs" component={() => <Docs />} />
        <Route path="/docs/deployment" component={() => <Docs page="deployment" />} />
        <Route path="/docs/apps" component={() => <Docs />} />
        <Route path="/docs/apps/:id" component={(props) => <Docs page={props.params.id} />} />
      </Router>
    </MetaProvider>
  );
}
