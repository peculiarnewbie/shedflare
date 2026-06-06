import { describe, expect, test } from "vite-plus/test";
import { normalizeTag, parseUpdateBody, publicFile } from "./file-utils";

describe("normalizeTag", () => {
  test("trims and lowercases", () => {
    expect(normalizeTag("  Hello  ")).toBe("hello");
  });

  test("collapses multiple spaces", () => {
    expect(normalizeTag("  foo   bar  baz  ")).toBe("foo bar baz");
  });

  test("handles tabs and mixed whitespace", () => {
    expect(normalizeTag("\tfoo\t\tbar\n")).toBe("foo bar");
  });

  test("empty string stays empty", () => {
    expect(normalizeTag("")).toBe("");
    expect(normalizeTag("   ")).toBe("");
  });
});

describe("parseUpdateBody", () => {
  test("returns null for non-object input", () => {
    expect(parseUpdateBody(null)).toBeNull();
    expect(parseUpdateBody(undefined)).toBeNull();
    expect(parseUpdateBody("string")).toBeNull();
    expect(parseUpdateBody(42)).toBeNull();
    expect(parseUpdateBody([1, 2])).toBeNull();
  });

  test("returns empty body for empty object", () => {
    expect(parseUpdateBody({})).toEqual({});
  });

  test("parses name", () => {
    expect(parseUpdateBody({ name: "new-name.txt" })).toEqual({ name: "new-name.txt" });
  });

  test("rejects non-string name", () => {
    expect(parseUpdateBody({ name: 42 })).toBeNull();
  });

  test("parses description", () => {
    expect(parseUpdateBody({ description: "a description" })).toEqual({
      description: "a description",
    });
  });

  test("parses isPublic", () => {
    expect(parseUpdateBody({ isPublic: true })).toEqual({ isPublic: true });
    expect(parseUpdateBody({ isPublic: false })).toEqual({ isPublic: false });
  });

  test("rejects non-boolean isPublic", () => {
    expect(parseUpdateBody({ isPublic: "yes" })).toBeNull();
    expect(parseUpdateBody({ isPublic: 1 })).toBeNull();
  });

  test("parses tags", () => {
    expect(parseUpdateBody({ tags: ["a", "b"] })).toEqual({ tags: ["a", "b"] });
  });

  test("rejects non-array tags", () => {
    expect(parseUpdateBody({ tags: "not-array" })).toBeNull();
  });

  test("rejects tags with non-string elements", () => {
    expect(parseUpdateBody({ tags: ["a", 42] })).toBeNull();
  });

  test("parses combined fields", () => {
    const input = { name: "f.txt", description: "desc", isPublic: true, tags: ["x"] };
    expect(parseUpdateBody(input)).toEqual(input);
  });
});

describe("publicFile", () => {
  test("maps row to public file shape", () => {
    const row = {
      id: "abc",
      name: "test.txt",
      mimeType: "text/plain",
      size: 1024,
      description: "a test file",
      isPublic: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      tags: "alpha,beta",
    };
    expect(publicFile(row)).toEqual({
      id: "abc",
      name: "test.txt",
      mimeType: "text/plain",
      size: 1024,
      description: "a test file",
      isPublic: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      tags: ["alpha", "beta"],
    });
  });

  test("handles null description", () => {
    const row = {
      id: "1",
      name: "f.txt",
      mimeType: "text/plain",
      size: 0,
      description: null,
      isPublic: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      tags: null,
    };
    const result = publicFile(row);
    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
  });

  test("handles empty tags string", () => {
    const row = {
      id: "1",
      name: "f.txt",
      mimeType: "text/plain",
      size: 0,
      description: "",
      isPublic: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      tags: "",
    };
    expect(publicFile(row).tags).toEqual([]);
  });

  test("coerces isPublic to boolean", () => {
    const row = {
      id: "1",
      name: "f.txt",
      mimeType: "text/plain",
      size: 0,
      description: "",
      isPublic: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      tags: null,
    };
    expect(publicFile(row).isPublic).toBe(true);
  });
});
