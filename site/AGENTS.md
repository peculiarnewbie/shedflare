# Shedflare Site – Agent Guidance

This directory contains the public Shedflare project website inside the canonical monorepo. Keep it
independently testable, buildable, and deployable through scoped workspace commands.

- Shared Shedflare dependencies must use `workspace:*`. Never commit `file:`, `link:`, sibling
  source paths, nested lockfiles, or site-local copies of root tooling.
- Use non-production stages for deployment proofs; preview stages must not claim production custom domains.
- Do not change production resources or deploy to `prod` unless explicitly requested.
- Do not add `as any`; validate external inputs at their boundaries.
