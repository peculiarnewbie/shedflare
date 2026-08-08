export function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

export type ParsedByteRange =
  | { kind: "full" }
  | { kind: "partial"; offset: number; length: number }
  | { kind: "unsatisfiable" };

export function parseByteRange(header: string | null, size: number): ParsedByteRange {
  if (!header) return { kind: "full" };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) {
    return { kind: "unsatisfiable" };
  }

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { kind: "unsatisfiable" };
    }
    const length = Math.min(suffixLength, size);
    return { kind: "partial", offset: size - length, length };
  }

  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(requestedEnd) ||
    offset < 0 ||
    offset >= size ||
    requestedEnd < offset
  ) {
    return { kind: "unsatisfiable" };
  }

  const end = Math.min(requestedEnd, size - 1);
  return { kind: "partial", offset, length: end - offset + 1 };
}

export function publicFile(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    mimeType: row.mimeType as string,
    size: row.size as number,
    description: (row.description as string | null) ?? "",
    isPublic: Boolean(row.isPublic),
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    tags: row.tags ? (row.tags as string).split(",").filter(Boolean) : [],
  };
}

export type UpdateFileBody = {
  name?: string;
  description?: string;
  isPublic?: boolean;
  tags?: string[];
};

export function parseUpdateBody(value: unknown): UpdateFileBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const body: UpdateFileBody = {};
  if (input.name !== undefined) {
    if (typeof input.name !== "string") return null;
    body.name = input.name;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") return null;
    body.description = input.description;
  }
  if (input.isPublic !== undefined) {
    if (typeof input.isPublic !== "boolean") return null;
    body.isPublic = input.isPublic;
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((t: unknown) => typeof t !== "string"))
      return null;
    body.tags = input.tags;
  }
  return body;
}
