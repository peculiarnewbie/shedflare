# ADR 0002: Modular monorepo

- Status: Accepted
- Date: 2026-08-29
- Owners: Shedflare maintainers
- Supersedes: [ADR 0001](0001-standalone-first-repositories.md)

## Context

Shedflare contains applications with distinct products, infrastructure, release concerns, and issue
domains. Users should be able to choose one app or any subset without treating the full suite as a
single inseparable product.

ADR 0001 tested whether separate Git repositories were the best way to preserve those boundaries.
Every app and the shared packages were extracted, given independent tooling and CI, and reconciled
across multiple machines. That proved standalone operation, but it also made ordinary maintenance a
distributed-systems problem: cross-cutting changes required coordinated branches, duplicated
tooling drifted, local discovery depended on a precisely arranged umbrella directory, and it was
easy for one machine to miss work pushed from another repository.

Git submodules and subtrees do not remove that coordination burden. Submodules expose detached
repository pointers and multi-step clone/update/PR workflows. Subtrees copy history between roots
and require disciplined split/pull operations. Automated fan-out would add a custom synchronization
system whose conflict and release semantics the project would have to own.

## Decision

Shedflare uses a modular monorepo as its canonical source:

- one Git repository, issue tracker, pull-request stream, root lockfile, dependency catalog, CI
  pipeline, and shared development toolchain;
- separately scoped app directories with their own manifests, tests, builds, Alchemy entrypoints,
  deployment safety rules, and issue/PR scope;
- shared packages consumed with the pnpm workspace protocol and released only when an external
  distribution actually needs a package artifact;
- opt-in suite composition driven by configuration, not by requiring every app to be deployed;
- pnpm filters as the normal fast path for app-specific local work and verification.

The Git boundary is deliberately broader than the application boundary. A contributor may file an
app-scoped issue or PR and work almost entirely within one directory, while cross-cutting changes
remain atomic and reviewable in one commit graph.

## Repository boundaries

```text
apps/<app>/       application-owned source, tests, manifest, and deployment stack
packages/<name>/  shared contract or implementation with demonstrated consumers
site/             project website and its independent deployment stack
tools/            root-owned development tooling
.github/          shared CI and scope-aware issue/PR intake
```

Child projects do not contain nested Git repositories, lockfiles, workspace declarations, CI
directories, or copies of root lint tooling. Local `@shedflare/*` dependencies use `workspace:*`;
filesystem and implicit sibling dependencies are prohibited. `pnpm boundaries:check` enforces these
rules.

An application remains independently understandable, testable, buildable, selectable, and
deployable. “Independent” no longer means “must be cloned as an unrelated Git repository.” If a
future consumer needs a genuinely independent source or binary distribution, it should be produced
from the canonical tree by an automated, one-way release process rather than bidirectional source
synchronization.

## Issues and pull requests

Issues and pull requests name an app, package, suite, or cross-cutting scope. Repository issue forms
provide the app/package selector, and titles may use a matching scope such as `[chat]` or `[core]`.
Review and CI can therefore remain app-oriented without fragmenting search, milestones, security
policy, or cross-project discussion across repositories.

The default CI verifies the complete workspace for confidence. Scoped commands provide local speed;
path-filtered CI jobs may be added later only if full verification becomes a measured bottleneck.

## Deployment and distribution

The source move does not change production infrastructure:

- Alchemy stack identities, Worker names, domains, D1 databases, R2 buckets, Durable Object classes,
  secrets, and stage conventions remain unchanged;
- no production deployment, destroy, secret rotation, package publication, or state-ownership
  transfer is part of this decision;
- each app can still be deployed through its own root script or direct Alchemy entrypoint;
- the root suite deploys only apps selected in `shedflare.config.jsonc`;
- Drive's source is canonical here, but its existing production lifecycle remains intentionally
  outside the root suite deploy/destroy commands.

People choosing only one app still configure and deploy only that app. The monorepo optimizes source
maintenance; it does not turn the full suite into the mandatory runtime or distribution unit.

## Migration provenance

The monorepo already retained the original pre-split history. The latest canonical source from each
split repository was reconciled into this tree from these commits:

| Source repository | Imported commit                            |
| ----------------- | ------------------------------------------ |
| `packages`        | `6be5d5d516a44d499398a8358a308dc43b58c49e` |
| `anki`            | `5e230d573806b331503489dd71eeafd1d79b65c6` |
| `auth`            | `88b293b2aba4cdc9e4ea5db119fa3dd10aa9be90` |
| `cf-bill`         | `a380d4b8234c18b17822971ab103757ae6807d9d` |
| `chat`            | `ba008931e1a0856e4c9f462972cc8b90b1070e2f` |
| `discord`         | `7393a2815d731f0b4e0f0b31061385a5b4a51a3c` |
| `drive`           | `f57dfca10440e892a4f9694d25507168369f1970` |
| `homepage`        | `d2c01cff3c5c03ea1b4ef6ccd014486a8b6a3eff` |
| `links`           | `ec0afd16eaa814a04b8949b774f4c221465bf43d` |
| `money`           | `ea004490fb6841c01e6eebb47dc147211ea55f94` |
| `observability`   | `39306764ce1757c575a19e2aa89e11731adcef3a` |
| `routines`        | `168d0b4166b06f1f0d175a2ce289a5d76e4d258a` |
| `site`            | `9919c9a9ae92c33842e897d4e1e7d0d557a9f7c0` |

Post-split history remains available in the archived repositories and through this immutable ledger.
Merging unrelated histories into the canonical graph would add duplicate versions of the same
files without improving day-to-day blame. The reconciled source diff and verification results are
the migration proof.

## Consequences

Positive consequences:

- cross-app and shared-package changes are atomic;
- every machine sees the same canonical state after one pull;
- dependency updates, lint rules, and CI cannot silently diverge by repository;
- issues, PRs, security fixes, and project planning are searchable in one place;
- app selection and deployment independence remain intact.

Costs and mitigations:

- cloning includes unrelated source; Git's object sharing and sparse checkout remain available if
  repository size becomes material;
- the shared issue tracker can feel noisy; mandatory scope fields and path-oriented labels/views keep
  work separated;
- broad CI can be slower; filters support local work and measured path-based CI can be introduced;
- workspace imports can accidentally create coupling; the boundary checker and package contracts
  make those dependencies explicit.

## Rollout

1. Reconcile every split repository tip and record its commit above.
2. Centralize package metadata, lint configuration, hooks, CI, and shared dependencies.
3. Pass a frozen install, boundary/contract checks, tests, and builds from the canonical repository.
4. Merge the migration before changing any external repository state.
5. Archive split repositories as read-only history with a pointer to their canonical monorepo path.
6. Keep local split checkouts only as temporary reconciliation references; do not accept new source
   changes there.
