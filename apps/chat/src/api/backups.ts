import { getRuntimeEnv, getSyncStub, requireSession, type AppEnv } from "#/runtime";

export const CHAT_BACKUP_LATEST_KEY = "backups/chat/latest.json.gz";
export const CHAT_BACKUP_SNAPSHOT_PREFIX = "backups/chat/snapshots/";

type ChatBackupEnv = AppEnv & {
  UPLOADS: R2Bucket;
  SYNC_ENGINE: DurableObjectNamespace;
};

export type BackupResponse = {
  ok: true;
  key: string;
  latestKey: string;
  createdAt: string;
  bytes: number;
  deletedKeys: string[];
};

export function formatChatBackupTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replace(".", "-");
}

export function createChatBackupKey(date: Date): string {
  return `${CHAT_BACKUP_SNAPSHOT_PREFIX}${formatChatBackupTimestamp(date)}.json.gz`;
}

export function parseChatBackupKeyTimestamp(key: string): Date | null {
  if (!key.startsWith(CHAT_BACKUP_SNAPSHOT_PREFIX) || !key.endsWith(".json.gz")) return null;
  const fileName = key.slice(CHAT_BACKUP_SNAPSHOT_PREFIX.length, -".json.gz".length);
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!match) return null;
  const iso = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createTwoMonthRetentionCutoff(now: Date): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 2);
  return cutoff;
}

export function selectExpiredChatBackupKeys(keys: string[], now: Date): string[] {
  const cutoff = createTwoMonthRetentionCutoff(now);
  return keys.filter((key) => {
    const createdAt = parseChatBackupKeyTimestamp(key);
    return createdAt !== null && createdAt < cutoff;
  });
}

async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const stream = new Blob([JSON.stringify(value)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function listChatBackupSnapshotKeys(bucket: R2Bucket): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: CHAT_BACKUP_SNAPSHOT_PREFIX, cursor });
    keys.push(...page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

async function enforceChatBackupRetention(bucket: R2Bucket, now: Date): Promise<string[]> {
  const keys = await listChatBackupSnapshotKeys(bucket);
  const deletedKeys = selectExpiredChatBackupKeys(keys, now);
  await Promise.all(deletedKeys.map((key) => bucket.delete(key)));
  return deletedKeys;
}

export async function createChatBackup(
  env: ChatBackupEnv,
  now = new Date(),
): Promise<BackupResponse> {
  const createdAt = now.toISOString();
  const key = createChatBackupKey(now);
  const stub = await getSyncStub(env);
  const response = await stub.fetch("https://sync.internal/backup/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ createdAt }),
  });

  if (!response.ok) {
    throw new Error(`Backup export failed: ${response.status} ${await response.text()}`);
  }

  const backup = await response.json();
  const gzipped = await gzipJson(backup);
  const httpMetadata = { contentType: "application/json", contentEncoding: "gzip" };
  const customMetadata = { createdAt, app: "chat" };

  const written = await env.UPLOADS.put(key, gzipped, { httpMetadata, customMetadata });
  await env.UPLOADS.put(CHAT_BACKUP_LATEST_KEY, gzipped, { httpMetadata, customMetadata });
  const deletedKeys = await enforceChatBackupRetention(env.UPLOADS, now);

  return {
    ok: true,
    key,
    latestKey: CHAT_BACKUP_LATEST_KEY,
    createdAt,
    bytes: written.size,
    deletedKeys,
  };
}

export async function handleChatBackup(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const env = getRuntimeEnv() as ChatBackupEnv;
  await requireSession(request, env, { refresh: false });
  return Response.json(await createChatBackup(env));
}
