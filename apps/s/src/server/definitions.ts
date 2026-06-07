import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const LinkRow = Schema.Struct({
  slug: Schema.String,
  url: Schema.String,
  hidePreview: Schema.Boolean,
  createdAt: Schema.String,
});

const linksListEp: any = { ...HttpApiEndpoint.get("list", "/api/links") };
linksListEp.success.add(Schema.Struct({ links: Schema.Array(LinkRow) }));

const linksCreateEp: any = { ...HttpApiEndpoint.post("create", "/api/links") };
linksCreateEp.payload.set("application/json", {
  encoding: { _tag: "Json" },
  schemas: [
    Schema.Struct({
      slug: Schema.String,
      url: Schema.String,
      hidePreview: Schema.optional(Schema.Boolean),
    }),
  ],
});
linksCreateEp.success.add(LinkRow);
linksCreateEp.error.add(Schema.Struct({ error: Schema.String }));

const linksDeleteEp: any = { ...HttpApiEndpoint.delete("remove", "/api/links/:slug") };
linksDeleteEp.params = Schema.Struct({ slug: Schema.String });
linksDeleteEp.success.add(Schema.Struct({ ok: Schema.Boolean }));

const linksGroup: any = HttpApiGroup.make("links");
linksGroup.endpoints["list"] = linksListEp;
linksGroup.endpoints["create"] = linksCreateEp;
linksGroup.endpoints["remove"] = linksDeleteEp;

export const shortApi: any = HttpApi.make("s");
shortApi.groups["links"] = linksGroup;
