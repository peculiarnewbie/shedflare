# Shared package guidance

This directory contains shared packages inside the canonical Shedflare monorepo.

- Add a shared abstraction only when multiple consumers have a stable contract; keep app-specific
  code in its app.
- Use `workspace:*` between local packages. Never use `file:`, `link:`, sibling source paths, or a
  nested lockfile/workspace.
- Preserve explicit public entry points and avoid importing another package's internal source.
- Keep contract packages topology-independent and validate external data at their boundaries.
- Verify changed packages with scoped checks/tests and run the root contract and boundary checks.
- Packing may be used for consumer/release verification. Publishing or changing package ownership
  requires explicit approval.
