export const apps = [
  {
    id: "chat",
    name: "Chat",
    summary: "An AI workspace with sync, file uploads, search, and browser automation.",
    resources: "Worker + Durable Object + R2 + Browser Rendering",
    notes: "Bring your own model/API keys and keep the runtime inside your Cloudflare account.",
  },
  {
    id: "drive",
    name: "Drive",
    summary: "A small private file store for personal documents and working files.",
    resources: "Worker + D1 + R2",
    notes: "Metadata lives in D1. Files live in R2. The app is intentionally personal-scale.",
  },
  {
    id: "money",
    name: "Money",
    summary: "Envelope budgeting for personal finance workflows.",
    resources: "Worker + Durable Object + R2",
    notes: "Built around a local-first sync protocol and a single owner's budgeting model.",
  },
  {
    id: "s",
    name: "Links",
    summary: "A simple link shortener with a dashboard.",
    resources: "Worker + D1",
    notes: "Shorten and manage links under your own domain.",
  },
];

export const helpers = [
  {
    id: "auth",
    name: "Auth",
    summary: "The single-owner gate in front of the suite.",
    resources: "Worker + KV",
    notes: "Protects your private tools from public access. It is not a SaaS user system.",
  },
  {
    id: "cf-bill",
    name: "CF Usage",
    summary: "Cloudflare usage visibility against plan limits.",
    resources: "Worker + Cloudflare API token",
    notes: "Uses your account token to show usage context for the Cloudflare cloud you operate in.",
  },
  {
    id: "observability",
    name: "Observability",
    summary: "Centralized error collection from tail events across all app Workers.",
    resources: "Worker + D1",
    notes: "Collects and stores errors from all Shedflare apps in one place.",
  },
];

export const guides = [
  {
    title: "Configure once",
    body: "The owner's deployment settings live in shedflare.config.jsonc. It is local, gitignored, and treated as the source of truth for domains, subdomains, owner email, and app vars.",
  },
  {
    title: "Deploy with Alchemy",
    body: "Alchemy stacks declare the Cloudflare resources and Workers for each app. The root suite stack composes deployable apps; this public website is intentionally outside that suite.",
  },
  {
    title: "Own the cloud boundary",
    body: "Shedflare does not promise hardware ownership. The tradeoff is different: deploy the software, resources, secrets, and data into a Cloudflare account you control.",
  },
  {
    title: "Keep it personal",
    body: "There are no tenants, teams, sign-up flows, or per-user settings. Auth exists to protect the owner's tools from the public internet.",
  },
];
