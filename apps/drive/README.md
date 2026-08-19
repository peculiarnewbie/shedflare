# Shedflare Drive

A minimal private Drive alternative with R2 file storage, D1 metadata, tags, and search.

## Uploads

Files larger than 10 MiB use R2 multipart uploads in 10 MiB parts. Drive uploads up to three
parts concurrently, retries transient part failures, shows completion progress, and aborts
unfinished multipart uploads when canceled. Smaller files keep the single-request upload path.

The signed-in Drive toolbar can create a short-lived secure upload command for sending a local
file from another shell. The command requires Bash and curl, starts with a two-minute
capability by default, transparently uses 10 MiB multipart requests, and rejects files over 500 MB.
Once an upload starts, its file-bound session can continue after the initial capability expires.

## Deployment

See [Deployment Guide](docs/deployment.md).

## Development

```bash
pnpm dev:drive
```
