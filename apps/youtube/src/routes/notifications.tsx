import { createMemo, createSignal, onMount } from "solid-js";
import type { NotifRow } from "../api";
import { fetchNotifications, markNotifRead, markAllNotifsRead } from "../api";
import NotifItem from "../components/notif-item";

function groupByDate(notifs: NotifRow[]): Map<string, NotifRow[]> {
  const groups = new Map<string, NotifRow[]>();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const n of notifs) {
    const d = new Date(n.timestamp);
    let key: string;
    if (d.toDateString() === today.toDateString()) key = "Today";
    else if (d.toDateString() === yesterday.toDateString()) key = "Yesterday";
    else key = d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

    const group = groups.get(key);
    if (group) group.push(n);
    else groups.set(key, [n]);
  }
  return groups;
}

export default function Notifications() {
  const [notifs, setNotifs] = createSignal<NotifRow[]>([]);
  const [filter, setFilter] = createSignal<"all" | "unread">("all");

  onMount(async () => {
    try {
      const data = await fetchNotifications();
      setNotifs(data.notifications);
    } catch {}
  });

  const filtered = createMemo(() => {
    const f = filter();
    const ns = notifs();
    if (f === "unread") return ns.filter((n) => !n.read);
    return ns;
  });

  const grouped = createMemo(() => groupByDate(filtered()));

  const unreadCount = createMemo(() => notifs().filter((n) => !n.read).length);

  async function handleRead(id: string) {
    try {
      await markNotifRead(id);
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {}
  }

  async function handleReadAll() {
    try {
      await markAllNotifsRead();
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  }

  return (
    <div>
      <div class="page-header">
        <h1>Notifications</h1>
        <div class="page-header-actions">
          <select
            style={{
              background: "var(--panel)",
              color: "var(--text)",
              border: "1px solid var(--line)",
              "border-radius": "var(--radius-sm)",
              padding: "6px 10px",
              "font-size": "13px",
            }}
            value={filter()}
            onChange={(e) => setFilter(e.currentTarget.value as any)}
          >
            <option value="all">All</option>
            <option value="unread">Unread ({unreadCount()})</option>
          </select>
          {unreadCount() > 0 && (
            <button class="btn btn-ghost btn-sm" onClick={handleReadAll}>
              Mark all read
            </button>
          )}
        </div>
      </div>

      {filtered().length === 0 ? (
        <div class="empty-state">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <div class="empty-state-title">All caught up</div>
          <div class="empty-state-desc">
            {filter() === "unread"
              ? "No unread notifications."
              : "No notifications yet. Sync to load them."}
          </div>
        </div>
      ) : (
        [...grouped().entries()].map(([dateLabel, items]) => (
          <div class="notif-date-group">
            <div class="notif-date-header">{dateLabel}</div>
            <div class="notif-feed">
              {items.map((n) => (
                <NotifItem notif={n} onRead={() => handleRead(n.id)} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
