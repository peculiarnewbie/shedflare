import { R2Mock, createR2Mock } from "@shedflare/test-utils/r2-mock";

export { R2Mock, createR2Mock };

export function asR2Bucket(mock: R2Mock): R2Bucket {
  // SAFETY: The published mock implements the R2 methods exercised by application tests.
  return mock as R2Mock & R2Bucket;
}
