// Type definitions for Cloudflare Worker bindings
// Auto-generated — edit wrangler.base.jsonc instead

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  BUDGET_DO: DurableObjectNamespace;
  UPLOADS: R2Bucket;
  APP_PUBLIC_URL: string;
  AUTH_ISSUER_URL: string;
  AUTH_CLIENT_ID: string;
  OWNER_EMAIL: string;
  DEV_AUTH_EMAIL?: string;
}
