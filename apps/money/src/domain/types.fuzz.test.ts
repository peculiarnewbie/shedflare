import { describe, expect, test } from "vite-plus/test";
import { createFuzzRandom } from "../test/fuzz";
import {
  formatCalendarDate,
  fromMonthInt,
  monthBoundaries,
  parseCalendarDate,
  prevMonthKey,
  toMonthInt,
} from "./types";

const SEED = 0x1eafcafe;

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

describe("calendar fuzzing", () => {
  test(`month conversions and boundaries hold across 5,000 cases (seed ${SEED})`, () => {
    const random = createFuzzRandom(SEED);

    for (let iteration = 0; iteration < 5_000; iteration++) {
      const year = random.int(1600, 2400);
      const month = random.int(1, 12);
      const key = monthKey(year, month);
      const integer = year * 100 + month;
      const daysInMonth = new Date(year, month, 0).getDate();
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      const previousYear = month === 1 ? year - 1 : year;
      const previousMonth = month === 1 ? 12 : month - 1;

      expect(toMonthInt(key)).toBe(integer);
      expect(fromMonthInt(integer)).toBe(key);
      expect(prevMonthKey(key)).toBe(monthKey(previousYear, previousMonth));
      expect(monthBoundaries(key)).toEqual({
        start: `${key}-01`,
        end: `${key}-${String(daysInMonth).padStart(2, "0")}`,
        exclusiveEnd: `${monthKey(nextYear, nextMonth)}-01`,
      });

      const day = random.int(1, daysInMonth);
      const date = `${key}-${String(day).padStart(2, "0")}`;
      const parsed = parseCalendarDate(date);
      expect(parsed).not.toBeNull();
      expect(formatCalendarDate(parsed!)).toBe(date);
    }
  });

  test(`invalid calendar components are rejected across 2,000 cases (seed ${SEED})`, () => {
    const random = createFuzzRandom(SEED);

    for (let iteration = 0; iteration < 2_000; iteration++) {
      const year = random.int(1600, 2400);
      const invalidMonth = random.bool() ? 0 : random.int(13, 99);
      const invalidDay = random.bool() ? 0 : random.int(32, 99);

      expect(
        parseCalendarDate(
          `${year}-${String(invalidMonth).padStart(2, "0")}-${String(random.int(1, 28)).padStart(2, "0")}`,
        ),
      ).toBeNull();
      expect(
        parseCalendarDate(
          `${year}-${String(random.int(1, 12)).padStart(2, "0")}-${String(invalidDay).padStart(2, "0")}`,
        ),
      ).toBeNull();
    }
  });
});
