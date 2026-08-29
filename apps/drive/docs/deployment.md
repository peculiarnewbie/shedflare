# Drive deployment guide

Alchemy is the supported deployment lifecycle. Drive's source lives in the monorepo, while its
production stack remains deliberately outside the root suite composition.

## Configuration

Create the root desired-state config if needed:

```bash
cp shedflare.config.example.jsonc shedflare.config.jsonc
```

Set `domain` and `ownerEmail`, add `"drive": {}` under `apps`, and keep Auth configured as
the external issuer. The app URL, issuer URL, client ID, and owner identity are resolved from the
root catalog and Drive manifest.

Alchemy generates and installs `SECURE_UPLOAD_TOKEN_SECRET`; operators do not need to create or
rotate that secret manually.

## Resource ownership

Each Drive stage owns:

- one Worker and its static assets;
- one D1 database for metadata, tags, and file records;
- one private R2 bucket containing file bodies.

Non-production stages derive separate Worker, D1, R2, and hostname values. Checked-in migrations
under `apps/drive/src/migrations` are applied to the stage's D1 database.

## Rehearsal

Run scoped commands from the monorepo root:

```bash
pnpm --filter @shedflare/drive plan --stage pilot
pnpm --filter @shedflare/drive deploy:stage --stage pilot
pnpm --filter @shedflare/drive destroy:stage --stage pilot
```

Review the plan before approval. It must not update, replace, or delete production resources.
Destruction removes the temporary stage's bucket and database, so confirm the stage name.

## Production

```bash
pnpm deploy:drive
```

Drive retains its existing `ShedflareDrive/prod` Alchemy state and physical resources. Moving the
source back into the monorepo does not copy data or transfer state ownership. Production deploy and
destroy operations require explicit approval; see the
[historical production cutover proof](production-cutover-proof.md) for the invariants previously
used to verify continuity.
