export const apps = [
  {
    id: "anki",
    name: "Anki",
    summary: "Online-first spaced repetition for personal flashcards.",
    resources: "Worker + D1",
    notes: "Review and edit cards in an independently deployable owner-only app.",
  },
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
    id: "discord",
    name: "Discord",
    summary: "A personal AI Discord bot with Gateway mention support.",
    resources: "Worker + Durable Objects",
    notes: "Runs the bot and conversation state inside your Cloudflare account.",
  },
  {
    id: "homepage",
    name: "Homepage",
    summary: "A personal profile, experience, and project showcase.",
    resources: "Worker + D1 + R2",
    notes: "Own the profile data and project imagery behind your homepage.",
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
  {
    id: "routines",
    name: "Routines",
    summary: "Daily routine tracking with progress visualization.",
    resources: "Worker + D1",
    notes: "A compact owner-only habit and routine workspace.",
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
    body: "Each independently released app owns an Alchemy stack for its Cloudflare resources. The optional suite composes pinned app releases instead of importing sibling source.",
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
