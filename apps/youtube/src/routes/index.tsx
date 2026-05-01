import { createSignal, onMount } from "solid-js";
import type { DashboardData } from "../api";
import { fetchDashboard } from "../api";

export default function Dashboard() {
  const [data, setData] = createSignal<DashboardData | null>(null);

  onMount(async () => {
    try {
      const d = await fetchDashboard();
      setData(d);
    } catch {}
  });

  return (
    <div>
      <div class="page-header">
        <h1>Dashboard</h1>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-card-value watch-later">{data()?.watchLaterCount ?? "..."}</div>
          <div class="stat-card-label">Watch Later videos</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value notifications">{data()?.unreadNotifCount ?? "..."}</div>
          <div class="stat-card-label">Unread notifications</div>
          <div class="stat-card-sub">{data()?.totalNotifs ?? "..."} total</div>
        </div>
      </div>

      <div class="section-title">Recent Watch Later</div>
      <div class="recent-list">
        {data()?.recentWatchLater.length ? (
          data()!.recentWatchLater.map((v) => (
            <div class="recent-item">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                style="flex-shrink: 0;"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <polygon points="10,9 15,12 10,15" fill="currentColor" stroke="none" />
              </svg>
              <span style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                {v.title}
              </span>
              <span class="recent-item-meta">{v.channelName}</span>
            </div>
          ))
        ) : (
          <div class="empty-state">
            <div class="empty-state-title">No videos yet</div>
            <div class="empty-state-desc">Sync your Watch Later to get started.</div>
          </div>
        )}
      </div>

      <div style="margin-top: 24px;">
        <div class="section-title">Recent Notifications</div>
        <div class="recent-list">
          {data()?.recentNotifications.length ? (
            data()!.recentNotifications.map((n) => (
              <div class="recent-item">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  style="flex-shrink: 0;"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  {n.title}
                </span>
                <span class="recent-item-meta">{n.channelName}</span>
              </div>
            ))
          ) : (
            <div class="empty-state">
              <div class="empty-state-title">No notifications yet</div>
              <div class="empty-state-desc">Sync your notifications to get started.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
