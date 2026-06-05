import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const FileSchema = Schema.Struct({
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

const TagCount = Schema.Struct({ name: Schema.String, count: Schema.Number });

const FilesSuccess = Schema.Struct({
  files: Schema.Array(FileSchema),
  nextOffset: Schema.optional(Schema.Number),
});
const FileSuccess = Schema.Struct({ file: FileSchema });
const DeleteSuccess = Schema.Struct({ ok: Schema.Boolean });
const TagsSuccess = Schema.Struct({ tags: Schema.Array(TagCount) });

const fileListEp = HttpApiEndpoint.get("list", "/api/files", {
  success: FilesSuccess,
});
const fileCreateEp = HttpApiEndpoint.post("create", "/api/files", {
  success: FileSuccess,
});
const fileUpdateEp = HttpApiEndpoint.patch("update", "/api/files/:id", {
  params: Schema.Struct({ id: Schema.String }),
  success: FileSuccess,
});
const fileDeleteEp = HttpApiEndpoint.delete("delete", "/api/files/:id", {
  params: Schema.Struct({ id: Schema.String }),
  success: DeleteSuccess,
});
const fileDownloadEp = HttpApiEndpoint.get("download", "/api/files/:id/download", {
  params: Schema.Struct({ id: Schema.String }),
  success: Schema.String,
});
const filePreviewEp = HttpApiEndpoint.get("preview", "/api/files/:id/preview", {
  params: Schema.Struct({ id: Schema.String }),
  success: Schema.String,
});

const filesGroup = HttpApiGroup.make("files").add(
  fileListEp,
  fileCreateEp,
  fileUpdateEp,
  fileDeleteEp,
  fileDownloadEp,
  filePreviewEp,
);

const tagListEp = HttpApiEndpoint.get("list", "/api/tags", {
  success: TagsSuccess,
});

const tagsGroup = HttpApiGroup.make("tags").add(tagListEp);

export const driveApi = HttpApi.make("drive").add(filesGroup, tagsGroup);
