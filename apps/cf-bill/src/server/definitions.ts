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

const usageEndpoint = HttpApiEndpoint.get("usage", "/api/usage", {
  success: UsageResponse,
});

export const cfBillApi = HttpApi.make("cf-bill").add(HttpApiGroup.make("usage").add(usageEndpoint));
