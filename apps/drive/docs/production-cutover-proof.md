# Production cutover proof

> Historical record: this documents the 2026-08-09 move to the temporary split repository. Drive's
> canonical source has since returned to the Shedflare monorepo while retaining the same production
> Alchemy state and resources.

Drive's production deployment moved from `shedflare/shedflare` to `shedflare/drive` on 2026-08-09
without moving its data.

## Safety gate

The suite and standalone checkouts both resolved the same Alchemy coordinates:

- stack: `ShedflareDrive`;
- stage: `prod`;
- logical resources: `DB`, `FILES`, and `DriveWorker`.

The standalone production plan contained two in-place updates and one no-op:

- `DB`: update migration source metadata and re-run the idempotent migration check;
- `DriveWorker`: update code, assets, and source-path metadata;
- `FILES`: no-op.

The plan contained no creates, replacements, or deletes. Deployment was allowed only after this
condition was confirmed.

## Before and after invariants

| Invariant              |                                 Before |       After |
| ---------------------- | -------------------------------------: | ----------: |
| D1 database ID         | `01957fc3-6ab5-4e85-a59a-3fd2c6577596` |   unchanged |
| D1 file rows           |                                     14 |          14 |
| D1 declared file bytes |                            148,901,147 | 148,901,147 |
| D1 public file rows    |                                      2 |           2 |
| R2 bucket              |           `shedflare-prod-drive-files` |   unchanged |
| R2 objects             |                                     14 |          14 |
| R2 bucket size         |                                 149 MB |      149 MB |
| Worker                 |                 `shedflare-prod-drive` |   unchanged |
| Custom domain          |             `drive.peculiarnewbie.com` |   unchanged |

After deployment, the root page and public-files API returned `200`, the API returned both public
files, protected endpoints returned `401` without a session, and Auth accepted the production
callback origin.

## Ownership handoff

The suite root stack no longer composes Drive, and the suite no longer exposes Drive production
deploy or destroy scripts. Its local desired-state config no longer selects Drive. The suite copy is
retained only as a frozen rollback snapshot and must never be used to destroy production resources.

This is the template for later app extractions: preserve stack, stage, logical resource IDs, physical
names, and bindings; reject destructive plans; compare application-level data invariants; then remove
the old deployment entrypoint.
