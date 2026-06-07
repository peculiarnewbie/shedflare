import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { DeleteResponse, FileResponse, FilesResponse, TagsResponse } from "../shared/schema";

const fileListEp = HttpApiEndpoint.get("list", "/api/files", {
  success: FilesResponse,
});
const fileCreateEp = HttpApiEndpoint.post("create", "/api/files", {
  success: FileResponse,
});
const fileUpdateEp = HttpApiEndpoint.patch("update", "/api/files/:id", {
  params: Schema.Struct({ id: Schema.String }),
  success: FileResponse,
});
const fileDeleteEp = HttpApiEndpoint.delete("delete", "/api/files/:id", {
  params: Schema.Struct({ id: Schema.String }),
  success: DeleteResponse,
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
  success: TagsResponse,
});

const tagsGroup = HttpApiGroup.make("tags").add(tagListEp);

export const driveApi = HttpApi.make("drive").add(filesGroup, tagsGroup);
