import { describe, expect, test } from "vite-plus/test";
import { formatSize, fileGlyph, sortFiles } from "./utils";
import type { DriveFile } from "./types";

describe("formatSize", () => {
  test("bytes for < 1024", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1023)).toBe("1023 B");
  });

  test("kilobytes", () => {
    expect(formatSize(1024)).toBe("1 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(1024 * 1024 - 1)).toBe("1,024 KB");
  });

  test("megabytes", () => {
    expect(formatSize(1024 * 1024)).toBe("1 MB");
    expect(formatSize(1024 * 1024 * 1.5)).toBe("1.5 MB");
  });

  test("gigabytes", () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe("1 GB");
    expect(formatSize(1024 * 1024 * 1024 * 2.5)).toBe("2.5 GB");
  });
});

function makeFile(overrides: Partial<DriveFile> = {}): DriveFile {
  return {
    id: "1",
    name: "test.txt",
    mimeType: "text/plain",
    size: 100,
    description: "",
    isPublic: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    tags: [],
    ...overrides,
  };
}

describe("fileGlyph", () => {
  test("image files", () => {
    expect(fileGlyph(makeFile({ mimeType: "image/png" }))).toBe("IMG");
    expect(fileGlyph(makeFile({ mimeType: "image/jpeg" }))).toBe("IMG");
    expect(fileGlyph(makeFile({ mimeType: "image/svg+xml" }))).toBe("IMG");
  });

  test("pdf files", () => {
    expect(fileGlyph(makeFile({ mimeType: "application/pdf" }))).toBe("PDF");
  });

  test("video files", () => {
    expect(fileGlyph(makeFile({ mimeType: "video/mp4" }))).toBe("VID");
    expect(fileGlyph(makeFile({ mimeType: "video/webm" }))).toBe("VID");
  });

  test("audio files", () => {
    expect(fileGlyph(makeFile({ mimeType: "audio/mpeg" }))).toBe("AUD");
    expect(fileGlyph(makeFile({ mimeType: "audio/wav" }))).toBe("AUD");
  });

  test("archive files", () => {
    expect(fileGlyph(makeFile({ mimeType: "application/zip" }))).toBe("ZIP");
    expect(fileGlyph(makeFile({ mimeType: "application/x-tar" }))).toBe("ZIP");
  });

  test("default to DOC", () => {
    expect(fileGlyph(makeFile({ mimeType: "text/plain" }))).toBe("DOC");
    expect(fileGlyph(makeFile({ mimeType: "application/json" }))).toBe("DOC");
    expect(fileGlyph(makeFile({ mimeType: "application/octet-stream" }))).toBe("DOC");
  });
});

describe("sortFiles", () => {
  const files: DriveFile[] = [
    makeFile({ id: "a", name: "banana.txt", size: 300, createdAt: "2026-03-01T00:00:00Z" }),
    makeFile({ id: "b", name: "apple.txt", size: 100, createdAt: "2026-01-01T00:00:00Z" }),
    makeFile({ id: "c", name: "cherry.txt", size: 200, createdAt: "2026-02-01T00:00:00Z" }),
  ];

  test("sort by name ascending", () => {
    const result = sortFiles(files, "name", "asc");
    expect(result.map((f) => f.name)).toEqual(["apple.txt", "banana.txt", "cherry.txt"]);
  });

  test("sort by name descending", () => {
    const result = sortFiles(files, "name", "desc");
    expect(result.map((f) => f.name)).toEqual(["cherry.txt", "banana.txt", "apple.txt"]);
  });

  test("sort by date ascending", () => {
    const result = sortFiles(files, "date", "asc");
    expect(result.map((f) => f.id)).toEqual(["b", "c", "a"]);
  });

  test("sort by date descending", () => {
    const result = sortFiles(files, "date", "desc");
    expect(result.map((f) => f.id)).toEqual(["a", "c", "b"]);
  });

  test("sort by size ascending", () => {
    const result = sortFiles(files, "size", "asc");
    expect(result.map((f) => f.size)).toEqual([100, 200, 300]);
  });

  test("sort by size descending", () => {
    const result = sortFiles(files, "size", "desc");
    expect(result.map((f) => f.size)).toEqual([300, 200, 100]);
  });

  test("does not mutate the original array", () => {
    const original = [...files];
    sortFiles(files, "name", "asc");
    expect(files.map((f) => f.id)).toEqual(original.map((f) => f.id));
  });
});
