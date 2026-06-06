import { describe, expect, test } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  DriveFile,
  TagSummary,
  FilesResponse,
  FileResponse,
  DeleteResponse,
  TagsResponse,
  SessionResponse,
} from "./schema";

describe("DriveFile schema", () => {
  test("decodes a valid file", () => {
    const input = {
      id: "abc",
      name: "test.txt",
      mimeType: "text/plain",
      size: 1024,
      description: "",
      isPublic: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      tags: ["a", "b"],
    };
    const result = Schema.decodeUnknownSync(DriveFile)(input);
    expect(result).toEqual(input);
  });

  test("rejects missing required fields", () => {
    expect(() => Schema.decodeUnknownSync(DriveFile)({ id: "1" })).toThrow();
  });

  test("rejects wrong types", () => {
    const input = {
      id: 123,
      name: "test.txt",
      mimeType: "text/plain",
      size: "not-a-number",
      description: "",
      isPublic: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      tags: [],
    };
    expect(() => Schema.decodeUnknownSync(DriveFile)(input)).toThrow();
  });
});

describe("TagSummary schema", () => {
  test("decodes valid tag", () => {
    expect(Schema.decodeUnknownSync(TagSummary)({ name: "work", count: 5 })).toEqual({
      name: "work",
      count: 5,
    });
  });

  test("rejects invalid types", () => {
    expect(() => Schema.decodeUnknownSync(TagSummary)({ name: 42, count: "five" })).toThrow();
  });
});

describe("FilesResponse schema", () => {
  test("decodes with files and nextOffset", () => {
    const input = {
      files: [
        {
          id: "1",
          name: "f.txt",
          mimeType: "text/plain",
          size: 0,
          description: "",
          isPublic: false,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          tags: [],
        },
      ],
      nextOffset: 30,
    };
    const result = Schema.decodeUnknownSync(FilesResponse)(input);
    expect(result.files).toHaveLength(1);
    expect(result.nextOffset).toBe(30);
  });

  test("decodes with null nextOffset", () => {
    const input = { files: [], nextOffset: null };
    const result = Schema.decodeUnknownSync(FilesResponse)(input);
    expect(result.nextOffset).toBeNull();
  });
});

describe("FileResponse schema", () => {
  test("decodes valid response", () => {
    const input = {
      file: {
        id: "1",
        name: "f.txt",
        mimeType: "text/plain",
        size: 0,
        description: "",
        isPublic: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        tags: [],
      },
    };
    expect(Schema.decodeUnknownSync(FileResponse)(input)).toEqual(input);
  });
});

describe("DeleteResponse schema", () => {
  test("decodes ok response", () => {
    expect(Schema.decodeUnknownSync(DeleteResponse)({ ok: true })).toEqual({ ok: true });
  });
});

describe("TagsResponse schema", () => {
  test("decodes tags list", () => {
    const input = { tags: [{ name: "work", count: 3 }] };
    expect(Schema.decodeUnknownSync(TagsResponse)(input)).toEqual(input);
  });
});

describe("SessionResponse schema", () => {
  test("decodes session", () => {
    const input = { user: { email: "test@example.com" } };
    expect(Schema.decodeUnknownSync(SessionResponse)(input)).toEqual(input);
  });

  test("rejects missing user", () => {
    expect(() => Schema.decodeUnknownSync(SessionResponse)({})).toThrow();
  });
});
