import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const bootstrapEndpoint = HttpApiEndpoint.get("bootstrap", "/api/bootstrap");
const modelsEndpoint = HttpApiEndpoint.get("models", "/api/models");
const uploadPresignEndpoint = HttpApiEndpoint.post("presign", "/api/uploads/presign");
const uploadCompleteEndpoint = HttpApiEndpoint.post("complete", "/api/uploads/complete");

export const chatApi = HttpApi.make("chat").add(
  HttpApiGroup.make("bootstrap").add(bootstrapEndpoint),
  HttpApiGroup.make("models").add(modelsEndpoint),
  HttpApiGroup.make("uploads").add(uploadPresignEndpoint, uploadCompleteEndpoint),
);
