import * as SharedSchema from "./shared/schema";

export const DriveFile = SharedSchema.DriveFile;
export type DriveFile = SharedSchema.DriveFile;

export const FileResponse = SharedSchema.FileResponse;
export type FileResponse = SharedSchema.FileResponse;

export const FilesResponse = SharedSchema.FilesResponse;
export type FilesResponse = SharedSchema.FilesResponse;

export const SessionResponse = SharedSchema.SessionResponse;
export type SessionResponse = SharedSchema.SessionResponse;

export const TagSummary = SharedSchema.TagSummary;
export type TagSummary = SharedSchema.TagSummary;

export const TagsResponse = SharedSchema.TagsResponse;
export type TagsResponse = SharedSchema.TagsResponse;

/* ── App-local types ──────────────────────────────── */

export type ViewMode = "grid" | "list";
export type SortBy = "name" | "date" | "size";
export type SortOrder = "asc" | "desc";

export type Toast = {
  id: string;
  message: string;
  type: "info" | "success" | "error";
};

export type ContextMenuState = {
  x: number;
  y: number;
  fileId: string;
};
