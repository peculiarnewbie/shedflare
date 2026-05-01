import { createMemo, createSignal, onMount } from "solid-js";
import type { VideoRow } from "../api";
import { fetchWatchLater, pruneVideo, unpruneVideo } from "../api";
import VideoRowComponent from "../components/video-row";

export default function WatchLater() {
  const [videos, setVideos] = createSignal<VideoRow[]>([]);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [filter, setFilter] = createSignal<"all" | "unpruned" | "pruned">("unpruned");

  onMount(async () => {
    try {
      const data = await fetchWatchLater();
      setVideos(data.videos);
    } catch {}
  });

  const filtered = createMemo(() => {
    const f = filter();
    const vs = videos();
    if (f === "unpruned") return vs.filter((v) => !v.pruned);
    if (f === "pruned") return vs.filter((v) => v.pruned);
    return vs;
  });

  const selectedCount = createMemo(() => selected().size);

  function toggleSelect(videoId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered().map((v) => v.videoId)));
  }

  function deselectAll() {
    setSelected(new Set<string>());
  }

  async function handlePrune(videoId: string) {
    try {
      await pruneVideo(videoId);
      setVideos((prev) => prev.map((v) => (v.videoId === videoId ? { ...v, pruned: true } : v)));
    } catch {}
  }

  async function handleUnprune(videoId: string) {
    try {
      await unpruneVideo(videoId);
      setVideos((prev) => prev.map((v) => (v.videoId === videoId ? { ...v, pruned: false } : v)));
    } catch {}
  }

  async function handlePruneSelected() {
    const ids = [...selected()];
    for (const id of ids) {
      await handlePrune(id);
    }
    deselectAll();
  }

  return (
    <div>
      <div class="page-header">
        <h1>Watch Later</h1>
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
            onChange={(e) => {
              setFilter(e.currentTarget.value as any);
              deselectAll();
            }}
          >
            <option value="unpruned">Active</option>
            <option value="pruned">Pruned</option>
            <option value="all">All</option>
          </select>
          <button class="btn btn-ghost btn-sm" onClick={selectAll}>
            Select all
          </button>
          {selectedCount() > 0 && (
            <button class="btn btn-ghost btn-sm" onClick={deselectAll}>
              Deselect
            </button>
          )}
        </div>
      </div>

      {selectedCount() > 0 && (
        <div class="bulk-bar">
          <span class="bulk-bar-count">{selectedCount()} selected</span>
          <div class="bulk-bar-actions">
            <button class="btn btn-danger btn-sm" onClick={handlePruneSelected}>
              Prune selected
            </button>
          </div>
        </div>
      )}

      <div class="wl-list">
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
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <polygon points="10,9 15,12 10,15" fill="currentColor" stroke="none" />
            </svg>
            <div class="empty-state-title">Nothing here</div>
            <div class="empty-state-desc">
              {filter() === "pruned"
                ? "No pruned videos."
                : "Your Watch Later is empty. Sync to load videos."}
            </div>
          </div>
        ) : (
          filtered().map((v) => (
            <VideoRowComponent
              video={v}
              selected={selected().has(v.videoId)}
              onToggle={() => toggleSelect(v.videoId)}
              onPrune={() => handlePrune(v.videoId)}
              onUnprune={() => handleUnprune(v.videoId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
