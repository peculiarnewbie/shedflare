# Shedflare Drive

A minimal private Drive alternative with R2 file storage, D1 metadata, tags, and search.

## Uploads

Files larger than 10 MiB use R2 multipart uploads in 10 MiB parts. Drive uploads up to three
parts concurrently, retries transient part failures, shows completion progress, and aborts
unfinished multipart uploads when canceled. Smaller files keep the single-request upload path.

## Deployment

See [Deployment Guide](docs/deployment.md).

## Development

```bash
pnpm dev:drive
```
