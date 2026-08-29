# Standalone extraction proof

> Historical record: this proof describes the completed split-repository experiment. Drive's
> canonical source has since returned to the Shedflare monorepo.

The Drive application was deployed from this independent repository on 2026-08-09 using the public Shedflare runtime packages and a packed `@shedflare/test-utils@0.1.0` artifact. No sibling checkout or relative dependency was used by the application or deployment stack.

## Temporary stage

- Stage: `e2e-drive-20260809d`
- URL: `https://shedflare-e2e-drive-20260809d-drive.peculiarnewbie.workers.dev`
- Worker: `shedflare-e2e-drive-20260809d-drive`
- Resources created: one Worker, one D1 database, and one private R2 bucket

The deployment runner waited for the app shell and authenticated API endpoints to pass consecutive readiness checks before starting Playwright. This accounts for propagation after a new `workers.dev` route is created.

## Browser results

All four browser tests passed:

- mobile file-browser navigation;
- optimistic auth-hint rendering;
- neutral session loading without an auth hint;
- the complete file lifecycle: upload, metadata and tags, download, rename, search, public/private access, and deletion.

The lifecycle exercised real temporary D1 and R2 resources. Alchemy destroyed the Worker, D1 database, and R2 bucket after the run. The stage does not own or reuse production resources.

The canonical repository declares released Shedflare dependencies with semver ranges. The packed test-utility override used before its npm publication was never committed.
