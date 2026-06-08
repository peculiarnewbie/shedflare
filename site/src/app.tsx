import { MetaProvider, Title } from "@solidjs/meta";
import { A, Route, Router } from "@solidjs/router";
import { For, Show } from "solid-js";
import "./styles.css";
import { apps, helpers, guides } from "./content";

const allTools = [...apps, ...helpers];

function findTool(id: string) {
  return allTools.find((item) => item.id === id);
}

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
        <p>Shedflare is a set of personal tools you deploy to your own Cloudflare account.</p>
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
            <p class="eyebrow">Your own tools, your own cloud</p>
            <h1>Personal apps that live in your Cloudflare account.</h1>
            <p class="lede">
              Shedflare is a set of private productivity apps — chat, file storage, budgeting, and a
              link shortener — that deploy into your own Cloudflare account.
            </p>
            <div class="actions">
              <A class="button primary" href="/docs">
                Get started
              </A>
              <A class="button secondary" href="/docs/apps">
                See the apps
              </A>
            </div>
          </div>
        </section>

        <section class="statement">
          <p>
            Built for one person. No sign-ups, no tenants, no pricing tiers. Just a repo you deploy
            and tools you own.
          </p>
        </section>

        <section class="apps-intro">
          <p class="eyebrow">The suite</p>
          <h2>Four apps, each built for a different job.</h2>
        </section>

        <For each={apps}>{(app, index) => <AppShowcase app={app} index={index()} />}</For>

        <section class="helpers-showcase">
          <div class="helpers-inner">
            <div class="helpers-header">
              <p class="eyebrow">Included helpers</p>
              <h2>Everything you need to run and manage the suite.</h2>
              <p class="helpers-blurb">
                Auth keeps your apps private. Observability collects errors across all Workers. CF
                Usage tracks your Cloudflare plan against limits.
              </p>
            </div>
            <div class="helper-grid">
              <For each={helpers}>{(helper) => <HelperCard helper={helper} />}</For>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function AppShowcase(props: { app: (typeof apps)[number]; index: number }) {
  const even = props.index % 2 === 0;
  const Visual =
    props.app.id === "chat"
      ? ChatVisual
      : props.app.id === "drive"
        ? DriveVisual
        : props.app.id === "money"
          ? MoneyVisual
          : LinksVisual;

  return (
    <section class={`app-showcase ${even ? "showcase-left" : "showcase-right"}`}>
      <div class="showcase-inner">
        <div class="showcase-text">
          <span class="showcase-number">0{props.index + 1}</span>
          <h2>{props.app.name}</h2>
          <p>{props.app.summary}</p>
          <div class="showcase-tags">
            {props.app.resources.split(" + ").map((r) => (
              <span class="tag">{r}</span>
            ))}
          </div>
          <A class="showcase-link" href={`/docs/apps/${props.app.id}`}>
            Read about {props.app.name.toLowerCase()} →
          </A>
        </div>
        <div class="showcase-visual">
          <div class={`showcase-art ${props.app.id}-art`}>
            <Visual />
          </div>
        </div>
      </div>
    </section>
  );
}

function ChatVisual() {
  return (
    <>
      <div class="art-window">
        <div class="art-titlebar" />
        <div class="art-bubble art-bubble-left" />
        <div class="art-bubble art-bubble-right" />
        <div class="art-bubble art-bubble-left art-bubble-small" />
      </div>
    </>
  );
}

function DriveVisual() {
  return (
    <>
      <div class="art-folder">
        <div class="art-folder-tab" />
        <div class="art-folder-body">
          <div class="art-doc art-doc-1" />
          <div class="art-doc art-doc-2" />
        </div>
      </div>
    </>
  );
}

function MoneyVisual() {
  return (
    <>
      <div class="art-coin">
        <div class="art-coin-inner" />
      </div>
      <div class="art-bars">
        <div class="art-bar" />
        <div class="art-bar" />
        <div class="art-bar" />
      </div>
    </>
  );
}

function LinksVisual() {
  return (
    <>
      <div class="art-link art-link-1" />
      <div class="art-link art-link-2" />
    </>
  );
}

function HelperCard(props: { helper: (typeof helpers)[number] }) {
  return (
    <A class="helper-card" href={`/docs/apps/${props.helper.id}`}>
      <h3>{props.helper.name}</h3>
      <p>{props.helper.summary}</p>
      <span class="helper-resources">{props.helper.resources}</span>
    </A>
  );
}

function Docs(props: { page?: string }) {
  const tool = () => findTool(props.page ?? "");

  return (
    <Shell>
      <main class="docs-layout">
        <aside class="docs-sidebar">
          <A href="/docs">Start</A>
          <A href="/docs/deployment">Deployment</A>
          <A href="/docs/apps">Apps</A>
          <For each={apps}>{(item) => <A href={`/docs/apps/${item.id}`}>{item.name}</A>}</For>
          <p class="sidebar-heading">Helpers</p>
          <For each={helpers}>{(item) => <A href={`/docs/apps/${item.id}`}>{item.name}</A>}</For>
        </aside>
        <article class="docs-page">
          <Show
            when={props.page === "deployment"}
            fallback={props.page ? <AppDoc app={tool()} /> : <DocsIndex />}
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
      <h1>Deploy personal software to your own cloud account.</h1>
      <p class="doc-lede">
        Shedflare is a single-owner self-hosting suite for Cloudflare. Deploy from source into your
        account, with Alchemy managing the Workers and platform resources.
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
      <h1>How to deploy.</h1>
      <p class="doc-lede">
        Each app lives under <code>apps/*</code> and has an Alchemy stack that declares its Worker,
        assets, bindings, and Cloudflare resources.
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

function AppDoc(props: { app?: (typeof allTools)[number] }) {
  return (
    <Show when={props.app} fallback={<DocsIndex />}>
      {(app) => (
        <>
          <p class="eyebrow">
            {app().id === "auth" || app().id === "cf-bill" || app().id === "observability"
              ? "Helper"
              : "App"}
          </p>
          <h1>Shedflare {app().name}</h1>
          <p class="doc-lede">{app().summary}</p>
          <dl class="facts">
            <div>
              <dt>Cloudflare resources</dt>
              <dd>{app().resources}</dd>
            </div>
            <div>
              <dt>What it does</dt>
              <dd>{app().notes}</dd>
            </div>
          </dl>
          <p>
            This is part of the owner-deployed suite and is protected by Shedflare Auth when
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
