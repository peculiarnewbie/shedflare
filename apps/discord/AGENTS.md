# Shedflare Discord – Agent Guidance

This directory contains the Shedflare Discord bot inside the canonical monorepo. Keep it
independently selectable, testable, buildable, and deployable through scoped workspace commands.

- Shared Shedflare dependencies must use `workspace:*`. Never commit `file:`, `link:`, sibling
  source paths, nested lockfiles, or app-local copies of root tooling.
- Keep bot tokens and API keys only in `.dev.vars` or environment variables; never commit them.
- Use non-production stages for deployment proofs and destroy them after smoke testing.
- Do not change production resources or deploy to `prod` unless explicitly requested.
- Do not add `as any`; validate Discord and model-provider inputs at their boundaries.
