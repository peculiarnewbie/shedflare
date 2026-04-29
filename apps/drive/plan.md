# Shedflare Drive — UI/UX Overhaul Plan

## Architecture: 3-Panel Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Top Bar (condensed hero + owner info)                       │
├────────┬──────────────────────────────────┬──────────────────┤
│ Left   │  Toolbar (toggle | sort | batch) │ Right           │
│ Sidebar│  ──────────────────────────────  │ Sidebar         │
│ ◈ Upload│  File Grid / List View          │ (selected file) │
│ ◈ Search│  ──────────────────────────────  │ ◈ Preview       │
│ ◈ Tags  │  Pagination / Load More        │ ◈ Details       │
│         │                                  │ ◈ Tags editor   │
│ collap- │                                  │ ◈ Actions       │
│ sible   │                                  │ width:320px     │
│ w:260px │                                  │ hidden if none  │
└────────┴──────────────────────────────────┴──────────────────┘
```

## New File Structure

```
src/
├── context.tsx              ← DriveContext with all signals
├── app.css                  ← heavily expanded CSS (keep existing tokens)
├── components/
│   ├── LeftSidebar.tsx
│   ├── RightSidebar.tsx
│   ├── UploadPanel.tsx      ← actual DnD handlers wired
│   ├── SearchPanel.tsx
│   ├── TagStrip.tsx
│   ├── ViewToolbar.tsx      ← grid/list toggle, sort dropdown
│   ├── FileGrid.tsx         ← thumbnail grid
│   ├── FileCard.tsx         ← single card with checkbox + preview
│   ├── FileList.tsx         ← table rows
│   ├── FileRow.tsx          ← single row with checkbox
│   ├── FileDetailPanel.tsx  ← right sidebar content
│   ├── DeleteConfirm.tsx    ← custom modal
│   ├── ToastContainer.tsx   ← toast stack with undo
│   ├── ContextMenu.tsx      ← right-click menu
│   ├── ShimmerSkeleton.tsx  ← loading placeholders
│   └── EmptyState.tsx
└── routes/
    └── index.tsx            ← simplified, wraps DriveProvider
```

## Server-side changes

Add `GET /api/files/:id/preview` in `worker.ts` — serves the file **inline** (not as attachment) so `<img>` tags can display it. Same R2 fetch but `Content-Disposition: inline`.

## State (context.tsx)

### Existing signals to carry over:

`files`, `tags`, `search`, `selectedTag`, `uploadTags`, `description`, `busy`, `error`, `checkingSession`, `unauthorized`, `userEmail`, `offset`, `hasMore`, `editingId`, `renameValue`

### New signals:

| Signal            | Type                         | Default     | Purpose                      |
| ----------------- | ---------------------------- | ----------- | ---------------------------- |
| `selectedFileId`  | `string`                     | `""`        | Right sidebar target         |
| `viewMode`        | `"grid" \| "list"`           | `"grid"`    | Display mode toggle          |
| `sortBy`          | `"name" \| "date" \| "size"` | `"date"`    | Sort column                  |
| `sortOrder`       | `"asc" \| "desc"`            | `"desc"`    | Sort direction               |
| `leftSidebarOpen` | `boolean`                    | `true`      | Sidebar collapse             |
| `selectedFileIds` | `Set<string>`                | `new Set()` | Batch selection              |
| `toasts`          | `Toast[]`                    | `[]`        | Notification stack           |
| `dragging`        | `boolean`                    | `false`     | Drag-over state on drop zone |
| `contextMenu`     | `{x,y,fileId} \| null`       | `null`      | Right-click menu state       |

## Implementation Order

### 1. context.tsx

Extract all signals into a `DriveContext` / `DriveProvider`. Move API functions (loadFiles, loadTags, bootstrap, upload, download, remove, startRename, submitRename, loadMore) into the provider. Add new signals listed above. Add sort function (client-side `Array.sort`).

### 2. routes/index.tsx

Slim to just `<DriveProvider><DriveShell/></DriveProvider>` with session check / unauthorized / error states at the provider level.

### 3. LeftSidebar, UploadPanel, SearchPanel, TagStrip

- **UploadPanel**: Wire `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` — visual glow pulse on drag-over. File input still works as fallback.
- **SearchPanel**: Text input + search icon.
- **TagStrip**: Tag pill buttons (existing logic, new location).
- **LeftSidebar**: Collapsible with toggle button, `width` transitions on collapse.

### 4. ViewToolbar

- Segmented control for grid/list toggle (icon buttons).
- Sort dropdown (name, date, size) with asc/desc toggle.
- Batch action bar when `selectedFileIds` size > 0 (download selected, delete selected).

### 5. FileGrid, FileCard

- **Grid**: CSS Grid, responsive columns based on viewport width (not minmax 280px — more generous).
- **Card**: Checkbox appears on hover (top-left corner). Click body → sets `selectedFileId` (opens right sidebar). Click checkbox → toggles in `selectedFileIds`. For image files, show `<img>` preview using `/api/files/:id/preview`. For video, show `<video>` element. For others, keep type badge but larger. Double-click name → inline rename (preserve). Pin star removed (deferred).

### 6. FileList, FileRow

- **List**: Table-like rows with columns: checkbox, type icon, name, tags, size, date, actions.
- Clickable column headers for sort.
- Row click → sets `selectedFileId`. Checkbox click → toggles selection.

### 7. RightSidebar, FileDetailPanel

- Slides in from right when `selectedFileId` is set. Closes on X button or click-outside.
- Shows: large file preview, name, description, size, type, dates, tags (editable), download / rename / delete actions.

### 8. ContextMenu

- Right-click on a file card/row → positioned menu overlay.
- Items: Download, Rename, Delete, Copy link. Click-away dismisses.

### 9. DeleteConfirm

- Centered modal overlay (not `confirm()`).
- Shows file name, confirm/cancel buttons.

### 10. ToastContainer

- Fixed bottom-right stack. Each toast has auto-dismiss (4s).
- Delete toast includes "Undo" button — implementation deferred (requires soft-delete API).

### 11. ShimmerSkeleton, EmptyState

- **Shimmer**: 6-8 placeholder cards with pulse animation during initial load and search transitions.
- **EmptyState**: Distinctive illustration or message when no files match (keep simple, not overly designed).

### 12. app.css — new sections

- Layout: full-viewport grid, sidebar columns
- Right sidebar: slide-in with `transform`/`opacity` transition
- View toolbar: segmented control, sort dropdown
- List view: table rows, column headers
- Context menu: positioned overlay
- Delete modal: centered dialog
- Toast: fixed-bottom-right, slide-up animation
- Shimmer: pulse keyframes
- Batch toolbar: floating bar
- Checkboxes: overlay on cards/rows, hover-only appearance
- Drag-over: glow animation on drop zone
- File reveal animation: `fadeIn` keyframe with staggered `animation-delay`

### 13. worker.ts — preview endpoint

Add route `GET /api/files/:id/preview` — identical to download but sets `Content-Disposition: inline` so browsers render images/video/audio in-page.

## Decisions Recorded

- **Thumbnails**: Full-resolution served inline via preview endpoint. No server-side resizing.
- **Pin/favorite**: Deferred. Not implementing for now.
- **Delete confirmation**: Custom modal dialog.
- **Batch select**: Checkboxes appear on hover (Google Drive pattern).
- **No hover card lift**: Remove `transform: translateY(-1px)` from `.file-card:hover`.
- **Keyboard shortcuts**: Deferred (including Cmd+K).
- **Styling/theme**: Preserve existing tokens. No visual restyle.
- **Motion scope**: File fade-in/fade-out on filter, upload panel collapse slide, drag-over glow, shimmer skeletons, right sidebar slide-in, toast slide-up, checkbox on-hover reveal.
