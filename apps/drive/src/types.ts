export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  description: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
};

export type TagSummary = { name: string; count: number };

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
