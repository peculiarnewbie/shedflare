# Standalone extraction proof

> Historical record: this proof describes the completed split-repository experiment. Anki's
> canonical source has since returned to the Shedflare monorepo.

The Anki application was deployed from this independent repository on 2026-08-08 using packed `0.1.0` artifacts from `shedflare/packages`. No sibling checkout or relative dependency was used.

## Temporary stage

- Stage: `pilot-anki-20260808`
- URL: `https://anki-pilot-anki-20260808.peculiarnewbie.com`
- Worker: `shedflare-pilot-anki-20260808-anki`
- Resources created: one Worker and one D1 database

## Smoke results

| Request               | Expected result          | Observed result |
| --------------------- | ------------------------ | --------------- |
| `GET /`               | App shell                | `200`           |
| `GET /api/auth/login` | External issuer redirect | `302`           |
| `GET /api/overview`   | Owner session required   | `401`           |
| `GET /api/session`    | No anonymous session     | `401`           |

Alchemy destroyed the Worker and D1 database after the smoke test. The stage does not own or reuse production resources.

The canonical repository declares `@shedflare/auth-client` and `@shedflare/alchemy` as `^0.1.0`. The temporary packed-artifact overrides used before npm publication were never committed.
