# Shedflare Chat – Agent Guidance

This directory contains Shedflare Chat inside the canonical monorepo. Keep it independently
selectable, testable, buildable, and deployable through scoped workspace commands. Shared sync
contracts live in `packages/sync-protocol`.

- Shared Shedflare dependencies must use `workspace:*`. Never commit `file:`, `link:`, sibling
  source paths, nested lockfiles, or app-local copies of root tooling.
- Use non-production stages for deployment proofs and destroy them after smoke testing.
- Do not change production resources or deploy to `prod` unless explicitly requested.
- Keep authentication owner-only. Do not add accounts, registration, tenants, or multi-user behavior.
- Do not add `as any`; validate external inputs at their boundaries.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `pnpm install` from the repository root after pulling remote changes.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
