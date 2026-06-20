# R2 Backups

This document plans lightweight R2 backups for Shedflare Chat. The goal is to protect the Durable Object SQLite state without moving chat’s primary storage out of the Durable Object.

## Goal

- Keep Durable Object SQLite as the primary chat store.
- Write periodic backup artifacts to the existing R2 bucket.
- Support manual backup creation.
- Keep backup retention simple and bounded.
- Do not implement restore in the first slice.

## Backup Scope

Back up the full chat Durable Object state needed to inspect or restore chat later:

- Full materialized sync snapshot from `getSnapshot()`.
- Event log rows, if practical.
- Command ack rows, if practical.
- Backup metadata: app name, protocol version, timestamp, and server sequence.

Do not duplicate uploaded media blobs. Attachment rows already contain R2 object keys for uploaded files. Backups should preserve that metadata and rely on the existing media objects remaining in R2.

## Backup Payload

```ts
type ChatBackup = {
  version: 1;
  app: "chat";
  createdAt: string;
  protocolVersion: string;
  serverSeq: number;
  snapshot: SyncSnapshot;
  events?: Array<{
    seq: number;
    eventId: string;
    opId: string | null;
    type: string;
    payloadJson: string;
    createdAt: string;
  }>;
  commands?: Array<{
    opId: string;
    type: string;
    status: string;
    responseJson: string | null;
    createdAt: string;
    ackedSeq: number | null;
  }>;
};
```

## R2 Object Layout

Use the existing R2 bucket with a dedicated backup prefix:

```text
backups/chat/latest.json.gz
backups/chat/snapshots/2026-06-18T19-30-00-000Z.json.gz
```

The timestamped snapshot is immutable. `latest.json.gz` is overwritten after each successful backup.

## Retention

Keep backups from the last two months.

After a new backup succeeds:

1. List `backups/chat/snapshots/`.
2. Parse timestamps from backup object names.
3. Delete timestamped backups older than two months.
4. Never delete `backups/chat/latest.json.gz` as part of retention.

If timestamp parsing fails for an object under the snapshots prefix, leave it alone rather than risk deleting a manually placed file.

## Triggers

### Manual

Add an authenticated endpoint:

```http
POST /api/backups/chat
```

Response:

```ts
type BackupResponse = {
  ok: true;
  key: string;
  latestKey: string;
  createdAt: string;
  bytes: number;
  deletedKeys: string[];
};
```

### Scheduled

Add a weekly scheduled backup after the manual path is working.

The scheduled handler should call the same backup function as `POST /api/backups/chat` so retention and object layout stay identical.

## Architecture

Prefer keeping R2 writes in the top-level Worker because the existing R2 binding is already there.

Recommended flow:

1. `POST /api/backups/chat` authenticates the owner through the existing auth gate.
2. Worker calls the chat Durable Object internal backup export route.
3. Durable Object serializes the backup payload from SQLite and returns JSON.
4. Worker gzips the JSON.
5. Worker writes the gzipped payload to:
   - `backups/chat/snapshots/<timestamp>.json.gz`
   - `backups/chat/latest.json.gz`
6. Worker applies two-month retention under `backups/chat/snapshots/`.
7. Worker returns backup metadata.

Internal DO route:

```http
POST /backup/export
```

This route should not be exposed directly through public API routing. It should only be called by the Worker after authentication or by the scheduled handler.

## Compression

Use gzip for backup objects.

Prefer `CompressionStream("gzip")` in the Worker runtime. If streaming compression makes implementation awkward, first convert the JSON payload to a `Blob` or `Response`, gzip it, and write the resulting stream or bytes to R2.

## Restore

Do not implement restore in the first slice.

Future restore should be explicit and guarded because it mutates primary chat storage. It should probably require:

- Owner authentication.
- A confirmation token or typed confirmation phrase.
- No active assistant turns.
- A backup schema/protocol version check.
- A dry-run validation step before replacing Durable Object storage.

## First Implementation Slice

1. Add a backup export helper in the chat Durable Object that returns `ChatBackup` JSON.
2. Add `POST /api/backups/chat` in the top-level Worker.
3. Gzip and write the backup to R2 under the timestamped key and `latest.json.gz`.
4. Enforce two-month retention for timestamped backup objects.
5. Return backup metadata from the endpoint.
6. Add a small Settings UI button later if desired.
7. Add weekly scheduled execution after the manual endpoint is verified.

## Verification

Manual verification:

1. Call `POST /api/backups/chat` while signed in.
2. Confirm the timestamped object exists in R2.
3. Confirm `backups/chat/latest.json.gz` exists and matches the new backup.
4. Download and decompress the object.
5. Confirm `snapshot.serverSeq` matches the current Durable Object head.
6. Confirm retention deletes only timestamped backups older than two months.

Automated checks:

- Backup key generation is stable and sortable.
- Retention leaves recent backups and deletes backups older than two months.
- Invalid timestamped-looking keys are not deleted if they cannot be parsed safely.
- Backup payload includes snapshot metadata and table data.
