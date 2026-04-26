# Auth Deployment Guide

Deploy Shedflare Auth first. Other apps use it as their OpenAuth issuer.

## 1. Install and Log In

```bash
pnpm install
pnpm --filter @shedflare/auth exec wrangler login
```

## 2. Provision KV

Create the OpenAuth storage namespace and copy the returned ID into `apps/auth/wrangler.jsonc`.

```bash
pnpm --filter @shedflare/auth exec wrangler kv namespace create "OPENAUTH_STORAGE"
```

## 3. Configure Google OAuth

Create a Google OAuth web client.

- Authorized JavaScript origin: `https://sf-auth.example.com`
- Authorized redirect URI: `https://sf-auth.example.com/google/callback`

Copy the Google client ID into `GOOGLE_CLIENT_ID` in `apps/auth/wrangler.jsonc`.

## 4. Configure Auth

Update `apps/auth/wrangler.jsonc`:

```jsonc
"vars": {
  "APP_PUBLIC_URL": "https://sf-auth.example.com",
  "GOOGLE_CLIENT_ID": "your-google-client-id",
  "OWNER_EMAIL": "you@example.com"
}
```

## 5. Deploy

```bash
pnpm deploy:auth
```

Apps should set `AUTH_ISSUER_URL` to the deployed `APP_PUBLIC_URL` for this Worker.
