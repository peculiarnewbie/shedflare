import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

export const ExperienceRow = Schema.Struct({
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
export type ExperienceRow = Schema.Schema.Type<typeof ExperienceRow>;

export const ProjectRow = Schema.Struct({
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
export type ProjectRow = Schema.Schema.Type<typeof ProjectRow>;

export const ApiError = Schema.Struct({ error: Schema.String });
export type ApiError = Schema.Schema.Type<typeof ApiError>;

export const ExperienceCreatePayload = Schema.Struct({
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
});
export type ExperienceCreatePayload = Schema.Schema.Type<typeof ExperienceCreatePayload>;

export const ExperienceUpdatePayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  workplace: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.String),
  startDate: Schema.optional(Schema.String),
  endDate: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  sortOrder: Schema.optional(Schema.Number),
  showOnHome: Schema.optional(Schema.Boolean),
});
export type ExperienceUpdatePayload = Schema.Schema.Type<typeof ExperienceUpdatePayload>;

export const ProjectCreatePayload = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  tags: Schema.String,
  image: Schema.String,
  url: Schema.String,
  githubUrl: Schema.String,
  desc: Schema.String,
  sortOrder: Schema.optional(Schema.Number),
  showOnHome: Schema.optional(Schema.Boolean),
});
export type ProjectCreatePayload = Schema.Schema.Type<typeof ProjectCreatePayload>;

export const ProjectUpdatePayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.String),
  image: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  githubUrl: Schema.optional(Schema.String),
  desc: Schema.optional(Schema.String),
  sortOrder: Schema.optional(Schema.Number),
  showOnHome: Schema.optional(Schema.Boolean),
});
export type ProjectUpdatePayload = Schema.Schema.Type<typeof ProjectUpdatePayload>;

const expListEndpoint = HttpApiEndpoint.get("list", "/api/experiences", {
  success: Schema.Array(ExperienceRow),
});

const projListEndpoint = HttpApiEndpoint.get("list", "/api/projects", {
  success: Schema.Array(ProjectRow),
});

const expCreateEndpoint = HttpApiEndpoint.post("create", "/api/admin/experiences", {
  payload: ExperienceCreatePayload,
  success: Schema.Union([ExperienceRow, ApiError]),
});

const expUpdateEndpoint = HttpApiEndpoint.put("update", "/api/admin/experiences/:id", {
  params: Schema.Struct({ id: Schema.String }),
  payload: ExperienceUpdatePayload,
  success: Schema.Union([ExperienceRow, ApiError]),
});

const expDeleteEndpoint = HttpApiEndpoint.delete("remove", "/api/admin/experiences/:id", {
  params: Schema.Struct({ id: Schema.String }),
  success: Schema.Struct({ ok: Schema.Boolean }),
});

const projCreateEndpoint = HttpApiEndpoint.post("create", "/api/admin/projects", {
  payload: ProjectCreatePayload,
  success: Schema.Union([ProjectRow, ApiError]),
});

const projUpdateEndpoint = HttpApiEndpoint.put("update", "/api/admin/projects/:id", {
  params: Schema.Struct({ id: Schema.String }),
  payload: ProjectUpdatePayload,
  success: Schema.Union([ProjectRow, ApiError]),
});

const projDeleteEndpoint = HttpApiEndpoint.delete("remove", "/api/admin/projects/:id", {
  params: Schema.Struct({ id: Schema.String }),
  success: Schema.Struct({ ok: Schema.Boolean }),
});

export const homepageApi = HttpApi.make("homepage").add(
  HttpApiGroup.make("experiences").add(expListEndpoint),
  HttpApiGroup.make("projects").add(projListEndpoint),
  HttpApiGroup.make("admin-experiences").add(
    expCreateEndpoint,
    expUpdateEndpoint,
    expDeleteEndpoint,
  ),
  HttpApiGroup.make("admin-projects").add(
    projCreateEndpoint,
    projUpdateEndpoint,
    projDeleteEndpoint,
  ),
);
