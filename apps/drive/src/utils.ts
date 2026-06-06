import type { DriveFile, SortBy, SortOrder } from "./types";

export function formatSize(size: number) {
  const fmt = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${fmt.format(size / 1024)} KB`;
  if (size < 1024 * 1024 * 1024) return `${fmt.format(size / 1024 / 1024)} MB`;
  return `${fmt.format(size / 1024 / 1024 / 1024)} GB`;
}

export function fileGlyph(file: DriveFile) {
  if (file.mimeType.startsWith("image/")) return "IMG";
  if (file.mimeType.includes("pdf")) return "PDF";
  if (file.mimeType.startsWith("video/")) return "VID";
  if (file.mimeType.startsWith("audio/")) return "AUD";
  if (file.mimeType.includes("zip") || file.mimeType.includes("tar")) return "ZIP";
  return "DOC";
}

export function sortFiles(files: DriveFile[], sortBy: SortBy, sortOrder: SortOrder): DriveFile[] {
  const sorted = [...files];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "date":
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "size":
        cmp = a.size - b.size;
        break;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });
  return sorted;
}
