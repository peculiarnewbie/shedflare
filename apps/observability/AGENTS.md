# Shedflare Observability – Agent Guidance

This directory contains the Shedflare Observability integration inside the canonical monorepo. Keep
it independently selectable, testable, buildable, and deployable through scoped workspace commands.

- Shared Shedflare dependencies must use `workspace:*`. Never commit `file:`, `link:`, sibling
  source paths, nested lockfiles, or app-local copies of root tooling.
- Use `vp` and the package scripts for checks, tests, and Alchemy commands.
- Use non-production stages for deployment proofs and destroy them after smoke testing.
- Do not change production resources or deploy to `prod` unless explicitly requested.
- Keep collected telemetry owner-only and avoid logging secrets or request credentials.
- Do not add `as any`; validate external inputs at their boundaries.
