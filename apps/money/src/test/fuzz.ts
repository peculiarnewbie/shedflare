export interface FuzzRandom {
  next(): number;
  int(min: number, max: number): number;
  bool(): boolean;
  pick<T>(values: readonly T[]): T;
}

/**
 * Small deterministic PRNG for fuzz tests.
 *
 * A failing seed always generates the same inputs, which keeps CI failures
 * reproducible without adding a property-testing runtime dependency.
 */
export function createFuzzRandom(seed: number): FuzzRandom {
  let state = seed >>> 0;

  function next(): number {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  return {
    next,
    int(min, max) {
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
        throw new Error(`Invalid fuzz integer range: ${min}..${max}`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    bool() {
      return next() < 0.5;
    },
    pick<T>(values: readonly T[]): T {
      if (values.length === 0) throw new Error("Cannot pick from an empty fuzz value set");
      return values[Math.floor(next() * values.length)]!;
    },
  };
}
