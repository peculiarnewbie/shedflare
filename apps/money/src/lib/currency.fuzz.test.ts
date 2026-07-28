import { describe, expect, test } from "vite-plus/test";
import { createFuzzRandom } from "../test/fuzz";
import { formatCentsValue, type NumberFormat } from "./currency";

const SEED = 0xc0ffee;
const NUMBER_FORMATS: readonly NumberFormat[] = ["comma-dot", "dot-comma", "space-dot"];

function groupThousands(value: string, separator: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function expectedUsd(cents: number, numberFormat: NumberFormat): string {
  const separators = {
    "comma-dot": { thousands: ",", decimal: "." },
    "dot-comma": { thousands: ".", decimal: "," },
    "space-dot": { thousands: " ", decimal: "." },
  }[numberFormat];
  const absoluteDigits = String(Math.abs(cents)).padStart(3, "0");
  const whole = absoluteDigits.slice(0, -2);
  const fraction = absoluteDigits.slice(-2);
  return `${cents < 0 ? "-" : ""}$${groupThousands(whole, separators.thousands)}${separators.decimal}${fraction}`;
}

function expectedIdr(cents: number, numberFormat: NumberFormat): string {
  const thousands = {
    "comma-dot": ",",
    "dot-comma": ".",
    "space-dot": " ",
  }[numberFormat];
  const roundedRupiah = Math.round(Math.abs(cents) / 100);
  return `${cents < 0 ? "-" : ""}Rp${groupThousands(String(roundedRupiah), thousands)}`;
}

describe("currency formatter fuzzing", () => {
  test(`matches integer reference formatting across 6,000 cases (seed ${SEED})`, () => {
    const random = createFuzzRandom(SEED);

    for (let iteration = 0; iteration < 2_000; iteration++) {
      const cents = random.int(-5_000_000_000_000, 5_000_000_000_000);

      for (const numberFormat of NUMBER_FORMATS) {
        expect(formatCentsValue(cents, "USD", numberFormat)).toBe(expectedUsd(cents, numberFormat));
        expect(formatCentsValue(cents, "IDR", numberFormat)).toBe(expectedIdr(cents, numberFormat));
      }
    }
  });

  test(`negative values preserve magnitude and gain one sign (seed ${SEED})`, () => {
    const random = createFuzzRandom(SEED);

    for (let iteration = 0; iteration < 1_000; iteration++) {
      const cents = random.int(1, 5_000_000_000_000);
      const numberFormat = random.pick(NUMBER_FORMATS);

      for (const currency of ["USD", "IDR"] as const) {
        expect(formatCentsValue(-cents, currency, numberFormat)).toBe(
          `-${formatCentsValue(cents, currency, numberFormat)}`,
        );
      }
    }
  });
});
