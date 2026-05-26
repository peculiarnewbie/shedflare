import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

/** Resolve an operator secret from process.env at deploy time, if set. */
export function optionalSecretConfig(
  name: string,
): Effect.Effect<Option.Option<Redacted.Redacted<string>>> {
  return Effect.sync(() => {
    const raw = process.env[name];
    return raw ? Option.some(Redacted.make(raw)) : Option.none();
  });
}
