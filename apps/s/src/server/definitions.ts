import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const LinkRow = Schema.Struct({
  slug: Schema.String,
  url: Schema.String,
  hidePreview: Schema.Boolean,
  createdAt: Schema.String,
});
const ApiError = Schema.Struct({ error: Schema.String });

const linksListEndpoint = HttpApiEndpoint.get("list", "/api/links", {
  success: Schema.Struct({ links: Schema.Array(LinkRow) }),
});

const linksCreateEndpoint = HttpApiEndpoint.post("create", "/api/links", {
  payload: Schema.Struct({
    slug: Schema.String,
    url: Schema.String,
    hidePreview: Schema.optional(Schema.Boolean),
  }),
  success: Schema.Union([LinkRow, ApiError]),
});

const linksDeleteEndpoint = HttpApiEndpoint.delete("remove", "/api/links/:slug", {
  params: Schema.Struct({ slug: Schema.String }),
  success: Schema.Struct({ ok: Schema.Boolean }),
});

export const shortApi = HttpApi.make("s").add(
  HttpApiGroup.make("links").add(linksListEndpoint, linksCreateEndpoint, linksDeleteEndpoint),
);
