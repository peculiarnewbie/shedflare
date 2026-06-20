import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const ExperienceRow = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  workplace: Schema.String,
  url: Schema.String,
  tags: Schema.String,
  startDate: Schema.String,
  endDate: Schema.NullOr(Schema.String),
  body: Schema.String,
  sortOrder: Schema.Number,
  showOnHome: Schema.Boolean,
  createdAt: Schema.String,
});

const ProjectRow = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  tags: Schema.String,
  image: Schema.String,
  url: Schema.String,
  githubUrl: Schema.String,
  sortOrder: Schema.Number,
  desc: Schema.String,
  showOnHome: Schema.Boolean,
  createdAt: Schema.String,
});

const expListEp: any = { ...HttpApiEndpoint.get("list", "/api/experiences") };
expListEp.success.add(Schema.Array(ExperienceRow));

const projListEp: any = { ...HttpApiEndpoint.get("list", "/api/projects") };
projListEp.success.add(Schema.Array(ProjectRow));

const expCreateEp: any = { ...HttpApiEndpoint.post("create", "/api/admin/experiences") };
expCreateEp.payload.set("application/json", {
  encoding: { _tag: "Json" },
  schemas: [
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      workplace: Schema.String,
      url: Schema.String,
      tags: Schema.String,
      startDate: Schema.String,
      endDate: Schema.optional(Schema.String),
      body: Schema.String,
      sortOrder: Schema.optional(Schema.Number),
      showOnHome: Schema.optional(Schema.Boolean),
    }),
  ],
});
expCreateEp.success.add(ExperienceRow);
expCreateEp.error.add(Schema.Struct({ error: Schema.String }));

const expUpdateEp: any = { ...HttpApiEndpoint.put("update", "/api/admin/experiences/:id") };
expUpdateEp.params = Schema.Struct({ id: Schema.String });
expUpdateEp.payload.set("application/json", {
  encoding: { _tag: "Json" },
  schemas: [
    Schema.Struct({
      title: Schema.optional(Schema.String),
      workplace: Schema.optional(Schema.String),
      url: Schema.optional(Schema.String),
      tags: Schema.optional(Schema.String),
      startDate: Schema.optional(Schema.String),
      endDate: Schema.optional(Schema.String),
      body: Schema.optional(Schema.String),
      sortOrder: Schema.optional(Schema.Number),
      showOnHome: Schema.optional(Schema.Boolean),
    }),
  ],
});
expUpdateEp.success.add(ExperienceRow);
expUpdateEp.error.add(Schema.Struct({ error: Schema.String }));

const expDeleteEp: any = { ...HttpApiEndpoint.delete("remove", "/api/admin/experiences/:id") };
expDeleteEp.params = Schema.Struct({ id: Schema.String });
expDeleteEp.success.add(Schema.Struct({ ok: Schema.Boolean }));

const projCreateEp: any = { ...HttpApiEndpoint.post("create", "/api/admin/projects") };
projCreateEp.payload.set("application/json", {
  encoding: { _tag: "Json" },
  schemas: [
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      tags: Schema.String,
      image: Schema.String,
      url: Schema.String,
      githubUrl: Schema.String,
      desc: Schema.String,
      sortOrder: Schema.optional(Schema.Number),
      showOnHome: Schema.optional(Schema.Boolean),
    }),
  ],
});
projCreateEp.success.add(ProjectRow);
projCreateEp.error.add(Schema.Struct({ error: Schema.String }));

const projUpdateEp: any = { ...HttpApiEndpoint.put("update", "/api/admin/projects/:id") };
projUpdateEp.params = Schema.Struct({ id: Schema.String });
projUpdateEp.payload.set("application/json", {
  encoding: { _tag: "Json" },
  schemas: [
    Schema.Struct({
      title: Schema.optional(Schema.String),
      tags: Schema.optional(Schema.String),
      image: Schema.optional(Schema.String),
      url: Schema.optional(Schema.String),
      githubUrl: Schema.optional(Schema.String),
      desc: Schema.optional(Schema.String),
      sortOrder: Schema.optional(Schema.Number),
      showOnHome: Schema.optional(Schema.Boolean),
    }),
  ],
});
projUpdateEp.success.add(ProjectRow);
projUpdateEp.error.add(Schema.Struct({ error: Schema.String }));

const projDeleteEp: any = { ...HttpApiEndpoint.delete("remove", "/api/admin/projects/:id") };
projDeleteEp.params = Schema.Struct({ id: Schema.String });
projDeleteEp.success.add(Schema.Struct({ ok: Schema.Boolean }));

const expGroup: any = HttpApiGroup.make("experiences");
expGroup.endpoints["list"] = expListEp;

const projGroup: any = HttpApiGroup.make("projects");
projGroup.endpoints["list"] = projListEp;

const adminExpGroup: any = HttpApiGroup.make("admin-experiences");
adminExpGroup.endpoints["create"] = expCreateEp;
adminExpGroup.endpoints["update"] = expUpdateEp;
adminExpGroup.endpoints["remove"] = expDeleteEp;

const adminProjGroup: any = HttpApiGroup.make("admin-projects");
adminProjGroup.endpoints["create"] = projCreateEp;
adminProjGroup.endpoints["update"] = projUpdateEp;
adminProjGroup.endpoints["remove"] = projDeleteEp;

export const homepageApi: any = HttpApi.make("homepage");
homepageApi.groups["experiences"] = expGroup;
homepageApi.groups["projects"] = projGroup;
homepageApi.groups["admin-experiences"] = adminExpGroup;
homepageApi.groups["admin-projects"] = adminProjGroup;
