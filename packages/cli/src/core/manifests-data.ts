import type { AppManifest } from "./manifests.js";

export const BUILTIN_MANIFESTS: Record<string, AppManifest> = {
  auth: {
    id: "auth",
    name: "Shedflare Auth",
    description: "OAuth2/OIDC authentication provider using OpenAuth",
    dependsOn: [],
    defaultSubdomain: "auth",
    vars: {
      APP_PUBLIC_URL: { from: "appUrl", description: "Public URL of this auth app" },
      GOOGLE_CLIENT_ID: { from: "user", description: "Google OAuth client ID" },
      OWNER_EMAIL: { from: "ownerEmail", description: "Deployment owner email" },
    },
    secrets: {},
    resources: [
      {
        type: "kv",
        binding: "OPENAUTH_STORAGE",
        name: "shedflare-auth-storage",
        idField: "OPENAUTH_STORAGE_ID",
      },
    ],
  },
  "cf-bill": {
    id: "cf-bill",
    name: "Shedflare CF Usage",
    description: "Cloudflare estimated usage vs plan limits dashboard",
    dependsOn: ["auth"],
    defaultSubdomain: "cf-bill",
    vars: {
      APP_PUBLIC_URL: { from: "appUrl", description: "Public URL of this app" },
      AUTH_ISSUER_URL: { from: "appUrl", app: "auth", description: "Auth issuer URL" },
      AUTH_CLIENT_ID: { from: "appId", description: "OAuth client ID for this app" },
      OWNER_EMAIL: { from: "ownerEmail", description: "Deployment owner email" },
      CLOUDFLARE_ACCOUNT_ID: {
        from: "user",
        description: "Cloudflare account ID (from dashboard URL)",
      },
      CLOUDFLARE_ZONE_ID: {
        from: "user",
        description: "Cloudflare zone ID for HTTP analytics (optional)",
      },
    },
    secrets: {
      CF_API_TOKEN: {
        description: "API token with Account Analytics: Read permission",
        required: true,
      },
    },
    resources: [],
  },
  chat: {
    id: "chat",
    name: "Shedflare Chat",
    description: "AI chat interface with browser automation",
    dependsOn: ["auth"],
    defaultSubdomain: "chat",
    vars: {
      APP_PUBLIC_URL: { from: "appUrl", description: "Public URL of this chat app" },
      AUTH_ISSUER_URL: { from: "appUrl", app: "auth", description: "Auth issuer URL" },
      AUTH_CLIENT_ID: { from: "appId", description: "OAuth client ID for this app" },
      DEFAULT_MODEL_ID: { from: "user", default: "auto", description: "Default LLM model ID" },
      OWNER_EMAIL: { from: "ownerEmail", description: "Deployment owner email" },
    },
    secrets: {
      OPENCODE_GO_API_KEY: { description: "API key for OpenCode Go backend", required: true },
      UPLOAD_TOKEN_SECRET: { description: "Random secret for signing upload URLs", required: true },
    },
    resources: [
      { type: "r2", binding: "UPLOADS", name: "shedflare-chat-uploads" },
      { type: "durable_object", binding: "SYNC_ENGINE" },
      { type: "browser", binding: "BROWSER", manualEnable: true },
    ],
  },
  money: {
    id: "money",
    name: "Shedflare Money",
    description: "Envelope-budgeting personal finance app",
    dependsOn: ["auth"],
    defaultSubdomain: "money",
    vars: {
      APP_PUBLIC_URL: { from: "appUrl", description: "Public URL of this money app" },
      AUTH_ISSUER_URL: { from: "appUrl", app: "auth", description: "Auth issuer URL" },
      AUTH_CLIENT_ID: { from: "appId", description: "OAuth client ID for this app" },
      OWNER_EMAIL: { from: "ownerEmail", description: "Deployment owner email" },
    },
    secrets: {},
    resources: [
      { type: "d1", binding: "MONEY_DB", name: "shedflare-money-db", idField: "MONEY_DB_ID" },
      { type: "r2", binding: "UPLOADS", name: "shedflare-money-uploads" },
    ],
  },
  drive: {
    id: "drive",
    name: "Shedflare Drive",
    description: "File storage and management",
    dependsOn: ["auth"],
    defaultSubdomain: "drive",
    vars: {
      APP_PUBLIC_URL: { from: "appUrl", description: "Public URL of this drive app" },
      AUTH_ISSUER_URL: { from: "appUrl", app: "auth", description: "Auth issuer URL" },
      AUTH_CLIENT_ID: { from: "appId", description: "OAuth client ID for this app" },
      OWNER_EMAIL: { from: "ownerEmail", description: "Deployment owner email" },
    },
    secrets: {},
    resources: [
      { type: "d1", binding: "DB", name: "shedflare-drive", idField: "DB_ID" },
      { type: "r2", binding: "FILES", name: "shedflare-drive-files" },
    ],
  },
  youtube: {
    id: "youtube",
    name: "Shedflare YouTube",
    description: "YouTube Watch Later manager + notification dashboard",
    dependsOn: ["auth"],
    defaultSubdomain: "youtube",
    vars: {
      APP_PUBLIC_URL: { from: "appUrl", description: "Public URL of this YouTube app" },
      AUTH_ISSUER_URL: { from: "appUrl", app: "auth", description: "Auth issuer URL" },
      AUTH_CLIENT_ID: { from: "appId", description: "OAuth client ID for this app" },
      OWNER_EMAIL: { from: "ownerEmail", description: "Deployment owner email" },
      SYNC_SECRET: {
        from: "user",
        description: "Shared secret to authenticate sync requests from CLI",
      },
    },
    secrets: {},
    resources: [{ type: "d1", binding: "DB", name: "shedflare-youtube", idField: "DB_ID" }],
  },
};
