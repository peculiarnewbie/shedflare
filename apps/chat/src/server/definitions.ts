import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const bootstrapEp: any = { ...HttpApiEndpoint.get("bootstrap", "/api/bootstrap") };
const modelsEp: any = { ...HttpApiEndpoint.get("models", "/api/models") };
const uploadPresignEp: any = { ...HttpApiEndpoint.post("presign", "/api/uploads/presign") };
const uploadCompleteEp: any = { ...HttpApiEndpoint.post("complete", "/api/uploads/complete") };

const bootstrapGroup: any = HttpApiGroup.make("bootstrap");
bootstrapGroup.endpoints["bootstrap"] = bootstrapEp;

const modelsGroup: any = HttpApiGroup.make("models");
modelsGroup.endpoints["models"] = modelsEp;

const uploadsGroup: any = HttpApiGroup.make("uploads");
uploadsGroup.endpoints["presign"] = uploadPresignEp;
uploadsGroup.endpoints["complete"] = uploadCompleteEp;

export const chatApi: any = HttpApi.make("chat");
chatApi.groups["bootstrap"] = bootstrapGroup;
chatApi.groups["models"] = modelsGroup;
chatApi.groups["uploads"] = uploadsGroup;
