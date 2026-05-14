import { issuer } from "@openauthjs/openauth";
import { GoogleOidcProvider } from "@openauthjs/openauth/provider/google";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { object, string } from "valibot";
import { createSubjects } from "@openauthjs/openauth/subject";

export const subjects = createSubjects({
  user: object({
    email: string(),
  }),
});

export type IssuerEnv = {
  GOOGLE_CLIENT_ID: string;
  OPENAUTH_STORAGE: unknown;
  OWNER_EMAIL: string;
  APP_PUBLIC_URL: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type GoogleOidcClaims = {
  email?: string;
  email_verified?: boolean;
};

export function createAuthIssuer(env: IssuerEnv) {
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
      reuse: 60 * 60 * 24,
      retention: 60 * 60 * 24 * 7,
    },
    success: async (ctx, value) => {
      if (value.provider === "google") {
        const claims = value.id as GoogleOidcClaims;
        if (!claims.email || claims.email_verified === false) {
          return new Response("No email from Google", { status: 400 });
        }
        if (normalizeEmail(claims.email) !== normalizeEmail(env.OWNER_EMAIL)) {
          return Response.redirect(`${env.APP_PUBLIC_URL}/forbidden`, 302);
        }
        return ctx.subject("user", { email: claims.email });
      }
      return new Response("Invalid provider", { status: 400 });
    },
  });
}
