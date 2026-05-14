export { subjects } from "@shedflare/auth-client/issuer";

import { createAuthIssuer as createSharedIssuer } from "@shedflare/auth-client/issuer";
import type { AppEnv } from "#/effect";

export function createAuthIssuer(env: AppEnv) {
  return createSharedIssuer({
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? "",
    OPENAUTH_STORAGE: env.OPENAUTH_STORAGE,
    OWNER_EMAIL: env.OWNER_EMAIL,
    APP_PUBLIC_URL: env.APP_PUBLIC_URL,
  });
}
