import type { WatchLaterVideoRow, NotificationRow } from "./db/schema";

export type SyncPayload = {
  syncedAt: string;
  watchLater: {
    videoId: string;
    title: string;
    channelId: string;
    channelName: string;
    durationSeconds?: number;
    thumbnailUrl?: string;
    publishedAt?: string;
    addedAt?: string;
    sortOrder: number;
  }[];
  notifications: {
    id: string;
    channelId?: string;
    channelName: string;
    channelAvatarUrl?: string;
    videoId?: string;
    title: string;
    type: string;
    timestamp: string;
  }[];
};

export type VideoRow = WatchLaterVideoRow;
export type NotifRow = NotificationRow;

export type DashboardData = {
  watchLaterCount: number;
  unreadNotifCount: number;
  totalNotifs: number;
  recentWatchLater: VideoRow[];
  recentNotifications: NotifRow[];
};

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function fetchDashboard(): Promise<DashboardData> {
  return apiFetch<DashboardData>("/api/dashboard");
}

export function fetchWatchLater(pruned?: boolean): Promise<{ videos: VideoRow[] }> {
  const params = pruned ? "?pruned=true" : "";
  return apiFetch<{ videos: VideoRow[] }>(`/api/watch-later${params}`);
}

export function fetchNotifications(unread?: boolean): Promise<{ notifications: NotifRow[] }> {
  const params = unread ? "?unread=true" : "";
  return apiFetch<{ notifications: NotifRow[] }>(`/api/notifications${params}`);
}

export function pruneVideo(videoId: string): Promise<void> {
  return apiFetch(`/api/watch-later/${encodeURIComponent(videoId)}/prune`, { method: "POST" });
}

export function unpruneVideo(videoId: string): Promise<void> {
  return apiFetch(`/api/watch-later/${encodeURIComponent(videoId)}/unprune`, { method: "POST" });
}

export function markNotifRead(id: string): Promise<void> {
  return apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function markAllNotifsRead(): Promise<void> {
  return apiFetch("/api/notifications/read-all", { method: "POST" });
}
