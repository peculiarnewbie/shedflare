import { createHash } from "node:crypto";
import { text, isCancel, cancel } from "@clack/prompts";
import { loadConfig, validateConfig, writeConfig } from "../core/config.js";
import { getWorkspaceRoot } from "../core/manifests.js";

export interface YoutubeSyncOptions {
  watchOnly?: boolean;
  notifOnly?: boolean;
}

const YT_API_BASE = "https://www.youtube.com/youtubei/v1";
const YT_CLIENT_VERSION = "2.20250101.00.00";
const YT_CONTEXT = {
  client: {
    clientName: "WEB",
    clientVersion: YT_CLIENT_VERSION,
    hl: "en",
    gl: "US",
  },
  user: { lockedSafetyMode: false },
  request: { useSsl: true },
};

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

function computeSapisidHash(sapisid: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = sha1(`${timestamp} ${sapisid}`);
  return `SAPISIDHASH ${timestamp}_${hash}`;
}

function buildHeaders(sapisid: string, sid: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Cookie: `__Secure-3PAPISID=${sapisid}; __Secure-3PSID=${sid}`,
    Authorization: computeSapisidHash(sapisid),
    "X-YouTube-Client-Name": "1",
    "X-YouTube-Client-Version": YT_CLIENT_VERSION,
    Origin: "https://www.youtube.com",
  };
}

function parseDuration(text: string | null): number | undefined {
  if (!text) return undefined;
  const parts = text.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function walkJson(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function walkArray(obj: unknown, path: string[]): unknown[] {
  const val = walkJson(obj, path);
  return Array.isArray(val) ? val : [];
}

function getText(obj: unknown, ...paths: string[]): string {
  for (const path of paths) {
    const val = walkJson(obj, path.split("."));
    if (typeof val === "string") return val;
    const runs = walkJson(val, ["runs"]);
    if (Array.isArray(runs) && runs.length > 0) {
      const text = (runs[0] as Record<string, unknown>)?.text;
      if (typeof text === "string") return text;
    }
  }
  return "";
}

function getThumbnail(obj: unknown): string | undefined {
  const thumbs = walkJson(obj, ["thumbnail", "thumbnails"]);
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    const url = (thumbs[thumbs.length - 1] as Record<string, unknown>)?.url;
    if (typeof url === "string") return url;
  }
  return undefined;
}

async function promptForCookie(name: string, description: string): Promise<string> {
  const result = await text({
    message: description,
    placeholder: `Paste your ${name} cookie value`,
  });
  if (isCancel(result) || result === undefined) {
    cancel("Operation cancelled");
    process.exit(0);
  }
  return result;
}

async function fetchWatchLater(sapisid: string, sid: string): Promise<SyncWatchLaterItem[]> {
  const body = JSON.stringify({
    browseId: "VLWL",
    context: YT_CONTEXT,
  });

  const response = await fetch(`${YT_API_BASE}/browse`, {
    method: "POST",
    headers: buildHeaders(sapisid, sid),
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`YouTube API error (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const contents = walkArray(data, [
    "contents",
    "twoColumnBrowseResultsRenderer",
    "tabs",
    "0",
    "tabRenderer",
    "content",
    "sectionListRenderer",
    "contents",
  ]);

  let items: unknown[] = [];
  for (const section of contents) {
    const sectionItems = walkArray(section, [
      "itemSectionRenderer",
      "contents",
      "0",
      "playlistVideoListRenderer",
      "contents",
    ]);
    items.push(...sectionItems);
  }

  const results: SyncWatchLaterItem[] = [];
  for (const item of items) {
    const renderer = walkJson(item, ["playlistVideoRenderer"]) as
      | Record<string, unknown>
      | undefined;
    if (!renderer) continue;

    const videoId = renderer.videoId as string | undefined;
    if (!videoId) continue;

    const title = getText(renderer, "title");
    const channelName = getText(renderer, "longBylineText", "shortBylineText");
    const channelId = getText(renderer, "longBylineText.runs.0.browseEndpoint.browseId");
    const durationText = getText(renderer, "lengthText.simpleText");
    const publishedText = getText(renderer, "publishedTimeText.simpleText");
    const thumbnailUrl = getThumbnail(renderer);
    const addedText = (renderer.addedDateText as Record<string, unknown>)?.simpleText ?? null;

    results.push({
      videoId,
      title: title || "Untitled",
      channelId: channelId || videoId,
      channelName: channelName || "Unknown",
      durationSeconds: parseDuration(durationText),
      thumbnailUrl,
      publishedAt: publishedText ? parseRelativeTime(publishedText) : undefined,
      addedAt: typeof addedText === "string" ? parseRelativeTime(addedText) : undefined,
      sortOrder: results.length,
    });
  }

  return results;
}

async function fetchNotifications(sapisid: string, sid: string): Promise<SyncNotifItem[]> {
  const body = JSON.stringify({
    context: YT_CONTEXT,
  });

  const response = await fetch(`${YT_API_BASE}/notification/get_notification_menu`, {
    method: "POST",
    headers: buildHeaders(sapisid, sid),
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`YouTube notifications API error (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const notifications = walkArray(data, [
    "actions",
    "0",
    "openNotificationAction",
    "notificationRenderer",
  ]);

  const results: SyncNotifItem[] = [];
  for (const n of notifications) {
    const renderer = n as Record<string, unknown>;
    const id =
      (renderer.notificationId as string | undefined) ??
      (renderer.navigationEndpoint?.urlEndpoint?.url as string);
    if (!id) continue;

    const title = getText(renderer, "title", "shortTitle");
    const channelName = getText(renderer, "channelName", "senderName");
    const videoId = (renderer.navigationEndpoint as Record<string, unknown>)?.watchEndpoint
      ?.videoId as string | undefined;
    const thumbnailUrl = getThumbnail(renderer);
    const timestamp = (renderer.sentTimeText as Record<string, unknown>)?.simpleText as
      | string
      | undefined;
    const notificationId = typeof id === "string" ? id : String(id);

    results.push({
      id: notificationId,
      channelName: channelName || "Unknown",
      videoId,
      title: title || "Untitled",
      type: "upload",
      timestamp: timestamp
        ? (parseRelativeTime(timestamp) ?? new Date().toISOString())
        : new Date().toISOString(),
    });
  }

  return results;
}

function parseRelativeTime(text: string | null): string | undefined {
  if (!text) return undefined;
  const now = Date.now();
  const match = text.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
  if (!match) {
    if (text.toLowerCase().includes("stream") || text.toLowerCase().includes("premiere")) {
      return new Date(now - 60000).toISOString();
    }
    return new Date(now - 3600000).toISOString();
  }
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    second: 1000,
    minute: 60000,
    hour: 3600000,
    day: 86400000,
    week: 604800000,
    month: 2592000000,
    year: 31536000000,
  };
  const ms = n * (multipliers[unit] || 3600000);
  return new Date(now - ms).toISOString();
}

interface SyncWatchLaterItem {
  videoId: string;
  title: string;
  channelId: string;
  channelName: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  publishedAt?: string;
  addedAt?: string;
  sortOrder: number;
}

interface SyncNotifItem {
  id: string;
  channelName: string;
  channelAvatarUrl?: string;
  videoId?: string;
  title: string;
  type: string;
  timestamp: string;
}

export async function youtubeSyncCommand(options: YoutubeSyncOptions): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("shedflare.config.jsonc not found. Run `shedflare init` first.");
    process.exit(1);
  }
  const validation = validateConfig(config);
  if (!validation.success) {
    console.error("Invalid shedflare.config.jsonc:", validation.error);
    process.exit(1);
  }
  const validConfig = validation.value;

  const youtubeVars = validConfig.vars?.youtube ?? {};
  let sapisid = youtubeVars.YT_SAPISID as string | undefined;
  let sid = youtubeVars.YT_SID as string | undefined;
  const syncSecret = youtubeVars.SYNC_SECRET as string | undefined;

  if (!sapisid) {
    sapisid = await promptForCookie(
      "__Secure-3PAPISID",
      "Enter your YouTube __Secure-3PAPISID cookie (from DevTools → Application → Cookies → youtube.com)",
    );
    if (!validConfig.vars) validConfig.vars = {};
    if (!validConfig.vars.youtube) validConfig.vars.youtube = {};
    (validConfig.vars.youtube as Record<string, string>).YT_SAPISID = sapisid;
    writeConfig(validConfig);
  }

  if (!sid) {
    sid = await promptForCookie("__Secure-3PSID", "Enter your YouTube __Secure-3PSID cookie");
    if (!validConfig.vars) validConfig.vars = {};
    if (!validConfig.vars.youtube) validConfig.vars.youtube = {};
    (validConfig.vars.youtube as Record<string, string>).YT_SID = sid;
    writeConfig(validConfig);
  }

  const appEntry = validConfig.apps?.youtube;
  if (!appEntry?.subdomain || !validConfig.domain) {
    console.error("YouTube app not configured. Run `shedflare add youtube` first.");
    process.exit(1);
  }
  const workerUrl = `https://${appEntry.subdomain}.${validConfig.domain}`;
  if (!syncSecret) {
    console.error(
      "SYNC_SECRET not configured. Run `shedflare configure` to set up the YouTube app.",
    );
    process.exit(1);
  }

  const watchOnly = options.watchOnly ?? false;
  const notifOnly = options.notifOnly ?? false;
  const fetchBoth = !watchOnly && !notifOnly;

  const syncedAt = new Date().toISOString();

  let watchLaterItems: SyncWatchLaterItem[] = [];
  let notifItems: SyncNotifItem[] = [];

  try {
    if (fetchBoth || watchOnly) {
      console.log("Fetching Watch Later from YouTube...");
      watchLaterItems = await fetchWatchLater(sapisid, sid);
      console.log(`  Found ${watchLaterItems.length} videos`);
    }

    if (fetchBoth || notifOnly) {
      console.log("Fetching notifications from YouTube...");
      notifItems = await fetchNotifications(sapisid, sid);
      console.log(`  Found ${notifItems.length} notifications`);
    }
  } catch (error) {
    console.error(
      "Error fetching from YouTube:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  const payload = {
    syncedAt,
    watchLater: watchLaterItems,
    notifications: notifItems,
  };

  console.log(`Syncing to ${workerUrl}/api/sync...`);
  const syncResponse = await fetch(`${workerUrl}/api/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": syncSecret,
    },
    body: JSON.stringify(payload),
  });

  if (!syncResponse.ok) {
    const text = await syncResponse.text();
    console.error(`Sync failed (${syncResponse.status}): ${text.slice(0, 200)}`);
    process.exit(1);
  }

  const result = await syncResponse.json();
  console.log("Sync complete:", JSON.stringify(result));
}

export async function youtubeCommand(_options: Record<string, unknown>): Promise<void> {
  console.log("Usage: shedflare youtube sync [--watch-only] [--notif-only]");
  console.log("");
  console.log("Commands:");
  console.log("  sync         Fetch YouTube data and sync to the dashboard Worker");
  console.log("");
  console.log("Options:");
  console.log("  --watch-only    Only sync Watch Later");
  console.log("  --notif-only    Only sync notifications");
}
