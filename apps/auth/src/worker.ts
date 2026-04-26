import { issuer } from "@openauthjs/openauth";
import { GoogleOidcProvider } from "@openauthjs/openauth/provider/google";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

type Env = {
  APP_PUBLIC_URL: string;
  GOOGLE_CLIENT_ID: string;
  OWNER_EMAIL: string;
  OPENAUTH_STORAGE: KVNamespace;
};

type GoogleOidcClaims = {
  email?: string;
  email_verified?: boolean;
};

const subjects = createSubjects({
  user: object({
    email: string(),
  }),
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createIssuer(env: Env) {
  return issuer({
    providers: {
      google: GoogleOidcProvider({
        clientID: env.GOOGLE_CLIENT_ID,
        scopes: ["email", "profile"],
      }),
    },
    subjects,
    storage: CloudflareStorage({ namespace: env.OPENAUTH_STORAGE as any }),
    ttl: {
      access: 60 * 60 * 24 * 365,
      refresh: 60 * 60 * 24 * 365,
    },
    success: async (ctx, value) => {
      if (value.provider !== "google") return new Response("Invalid provider", { status: 400 });
      const claims = value.id as GoogleOidcClaims;
      if (!claims.email || claims.email_verified === false) {
        return new Response("No verified email from Google", { status: 400 });
      }
      if (normalizeEmail(claims.email) !== normalizeEmail(env.OWNER_EMAIL)) {
        return Response.redirect(`${env.APP_PUBLIC_URL}/forbidden`, 302);
      }
      return ctx.subject("user", { email: claims.email });
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response("Shedflare Auth", { headers: { "content-type": "text/plain" } });
    }
    if (url.pathname === "/forbidden") {
      return new Response("This Google account is not allowed for this Shedflare install.", {
        status: 403,
      });
    }
    return await createIssuer(env).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
