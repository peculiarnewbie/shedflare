import type { NotifRow } from "../api";

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotifItem(props: { notif: NotifRow; onRead: () => void }) {
  const n = () => props.notif;

  return (
    <div classList={{ "notif-item": true, unread: !n().read, read: n().read }}>
      <div class="notif-dot" />
      <div
        class="notif-content"
        onClick={() => {
          if (!n().read) props.onRead();
        }}
      >
        <div class="notif-channel">
          {n().channelAvatarUrl && (
            <img class="notif-channel-avatar" src={n().channelAvatarUrl!} alt="" />
          )}
          <span class="notif-channel-name">{n().channelName}</span>
        </div>
        <div class="notif-title">{n().title}</div>
        <div class="notif-meta">
          <span>{formatRelative(n().timestamp)}</span>
          <span class="notif-type-badge">{n().type}</span>
        </div>
      </div>
      <div class="notif-actions">
        {!n().read && (
          <button
            class="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              props.onRead();
            }}
          >
            Mark read
          </button>
        )}
      </div>
    </div>
  );
}
