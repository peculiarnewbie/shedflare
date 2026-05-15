import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const UploadResponse = Schema.Struct({
  filename: Schema.String,
  uploadedAt: Schema.String,
});

const uploadEp: any = { ...HttpApiEndpoint.put("upload", "/api/upload") };
uploadEp.success.add(UploadResponse);

const uploadGetEp: any = { ...HttpApiEndpoint.get("download", "/api/upload/:key") };
uploadGetEp.params = Schema.Struct({ key: Schema.String });
uploadGetEp.success.add(Schema.String);

const uploadGroup: any = HttpApiGroup.make("uploads");
uploadGroup.endpoints["upload"] = uploadEp;
uploadGroup.endpoints["download"] = uploadGetEp;

export const moneyApi: any = HttpApi.make("money");
moneyApi.groups["uploads"] = uploadGroup;
