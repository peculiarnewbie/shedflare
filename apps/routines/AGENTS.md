# Shedflare Routines – Agent Guidance

This directory contains Shedflare Routines inside the canonical monorepo. Keep it independently
selectable, testable, buildable, and deployable through scoped workspace commands.

- Shared Shedflare dependencies must use `workspace:*`. Never commit `file:`, `link:`, sibling
  source paths, nested lockfiles, or app-local copies of root tooling.
- Use `vp` and the package scripts for Vite, formatting, linting, tests, and Alchemy commands.
- Use non-production stages for deployment proofs and destroy them after smoke testing.
- Do not change production resources, deploy to `prod`, or point a temporary stage at production D1 or R2 resources unless explicitly requested.
- Keep authentication owner-only. Do not add accounts, registration, tenants, or multi-user behavior.
- Do not add `as any`; validate external inputs at their boundaries.
