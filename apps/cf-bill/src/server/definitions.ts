import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const UsageMetric = Schema.Struct({
  label: Schema.String,
  used: Schema.Number,
  unit: Schema.String,
  limits: Schema.Struct({ free: Schema.Number, paid: Schema.Number }),
});

const UsageResponse = Schema.Struct({
  period: Schema.Struct({ start: Schema.String, end: Schema.String }),
  products: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      metrics: Schema.Array(UsageMetric),
    }),
  ),
});

const usageEp: any = { ...HttpApiEndpoint.get("usage", "/api/usage") };
usageEp.success.add(UsageResponse);

const usageGroup: any = HttpApiGroup.make("usage");
usageGroup.endpoints["usage"] = usageEp;

export const cfBillApi: any = HttpApi.make("cf-bill");
cfBillApi.groups["usage"] = usageGroup;
