import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const FileSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  mimeType: Schema.String,
  size: Schema.Number,
  description: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  tags: Schema.Array(Schema.String),
});

const TagCount = Schema.Struct({ name: Schema.String, count: Schema.Number });

// File endpoints
const fileListEp: any = { ...HttpApiEndpoint.get("list", "/api/files") };
fileListEp.success.add(
  Schema.Struct({ files: Schema.Array(FileSchema), nextOffset: Schema.optional(Schema.Number) }),
);

const fileCreateEp: any = { ...HttpApiEndpoint.post("create", "/api/files") };
fileCreateEp.success.add(Schema.Struct({ file: FileSchema }));

const fileUpdateEp: any = { ...HttpApiEndpoint.patch("update", "/api/files/:id") };
fileUpdateEp.params = Schema.Struct({ id: Schema.String });
fileUpdateEp.success.add(Schema.Struct({ file: FileSchema }));

const fileDeleteEp: any = { ...HttpApiEndpoint.delete("delete", "/api/files/:id") };
fileDeleteEp.params = Schema.Struct({ id: Schema.String });
fileDeleteEp.success.add(Schema.Struct({ ok: Schema.Boolean }));

const fileDownloadEp: any = { ...HttpApiEndpoint.get("download", "/api/files/:id/download") };
fileDownloadEp.params = Schema.Struct({ id: Schema.String });
fileDownloadEp.success.add(Schema.String);

const filePreviewEp: any = { ...HttpApiEndpoint.get("preview", "/api/files/:id/preview") };
filePreviewEp.params = Schema.Struct({ id: Schema.String });
filePreviewEp.success.add(Schema.String);

const filesGroup: any = HttpApiGroup.make("files");
filesGroup.endpoints["list"] = fileListEp;
filesGroup.endpoints["create"] = fileCreateEp;
filesGroup.endpoints["update"] = fileUpdateEp;
filesGroup.endpoints["delete"] = fileDeleteEp;
filesGroup.endpoints["download"] = fileDownloadEp;
filesGroup.endpoints["preview"] = filePreviewEp;

// Tag endpoints
const tagListEp: any = { ...HttpApiEndpoint.get("list", "/api/tags") };
tagListEp.success.add(Schema.Struct({ tags: Schema.Array(TagCount) }));

const tagsGroup: any = HttpApiGroup.make("tags");
tagsGroup.endpoints["list"] = tagListEp;

// API
export const driveApi: any = HttpApi.make("drive");
driveApi.groups["files"] = filesGroup;
driveApi.groups["tags"] = tagsGroup;
