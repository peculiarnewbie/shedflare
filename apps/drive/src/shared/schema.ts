import * as Schema from "effect/Schema";

export const DriveFile = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  mimeType: Schema.String,
  size: Schema.Number,
  description: Schema.String,
  isPublic: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  tags: Schema.Array(Schema.String),
});
export type DriveFile = Schema.Schema.Type<typeof DriveFile>;

export const TagSummary = Schema.Struct({
  name: Schema.String,
  count: Schema.Number,
});
export type TagSummary = Schema.Schema.Type<typeof TagSummary>;

export const FilesResponse = Schema.Struct({
  files: Schema.Array(DriveFile),
  nextOffset: Schema.NullOr(Schema.Number),
});
export type FilesResponse = Schema.Schema.Type<typeof FilesResponse>;

export const FileResponse = Schema.Struct({
  file: DriveFile,
});
export type FileResponse = Schema.Schema.Type<typeof FileResponse>;

export const MultipartUploadResponse = Schema.Struct({
  fileId: Schema.String,
  uploadId: Schema.String,
  partSize: Schema.Number,
});
export type MultipartUploadResponse = Schema.Schema.Type<typeof MultipartUploadResponse>;

export const MultipartPartResponse = Schema.Struct({
  partNumber: Schema.Number,
  etag: Schema.String,
});
export type MultipartPartResponse = Schema.Schema.Type<typeof MultipartPartResponse>;

export const DeleteResponse = Schema.Struct({
  ok: Schema.Boolean,
});
export type DeleteResponse = Schema.Schema.Type<typeof DeleteResponse>;

export const TagsResponse = Schema.Struct({
  tags: Schema.Array(TagSummary),
});
export type TagsResponse = Schema.Schema.Type<typeof TagsResponse>;

export const SessionResponse = Schema.Struct({
  user: Schema.Struct({ email: Schema.String }),
});
export type SessionResponse = Schema.Schema.Type<typeof SessionResponse>;
