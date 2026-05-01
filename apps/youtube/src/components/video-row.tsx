import type { VideoRow } from "../api";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function VideoRow(props: {
  video: VideoRow;
  selected: boolean;
  onToggle: () => void;
  onPrune: () => void;
  onUnprune: () => void;
}) {
  const v = () => props.video;

  return (
    <div classList={{ "wl-row": true, pruned: v().pruned }}>
      <input
        type="checkbox"
        class="wl-checkbox"
        checked={props.selected}
        onChange={props.onToggle}
        onClick={(e) => e.stopPropagation()}
      />
      <div class="wl-thumb">
        {v().thumbnailUrl && <img src={v().thumbnailUrl!} alt="" loading="lazy" />}
        {v().durationSeconds && (
          <span class="wl-thumb-duration">{formatDuration(v().durationSeconds)}</span>
        )}
      </div>
      <div class="wl-info">
        <div class="wl-title">{v().title}</div>
        <div class="wl-channel">{v().channelName}</div>
        <div class="wl-meta">
          <span>Added {formatRelative(v().addedAt)}</span>
          {v().publishedAt && <span>· Published {formatRelative(v().publishedAt)}</span>}
        </div>
      </div>
      <div class="wl-actions">
        {v().pruned ? (
          <button
            class="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              props.onUnprune();
            }}
          >
            Undo
          </button>
        ) : (
          <button
            class="btn btn-ghost-danger btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              props.onPrune();
            }}
          >
            Prune
          </button>
        )}
      </div>
    </div>
  );
}
