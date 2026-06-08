import { describe, expect, test } from "vite-plus/test";
import { formatCentsValue } from "./currency";

describe("formatCentsValue", () => {
  test("USD formats with 2 decimals and a $ sign", () => {
    expect(formatCentsValue(123_456, "USD")).toBe("$1,234.56");
    expect(formatCentsValue(100, "USD")).toBe("$1.00");
    expect(formatCentsValue(0, "USD")).toBe("$0.00");
  });

  test("IDR formats with 0 decimals and an Rp prefix", () => {
    expect(formatCentsValue(123_456, "IDR")).toBe("Rp1,235");
    expect(formatCentsValue(100, "IDR")).toBe("Rp1");
    expect(formatCentsValue(0, "IDR")).toBe("Rp0");
  });

  test("negative values get a leading minus sign", () => {
    expect(formatCentsValue(-123_456, "USD")).toBe("-$1,234.56");
    expect(formatCentsValue(-123_456, "IDR")).toBe("-Rp1,235");
  });

  test("thousands separators differ by number format", () => {
    expect(formatCentsValue(1_234_567_89, "USD", "comma-dot")).toBe("$1,234,567.89");
    expect(formatCentsValue(1_234_567_89, "USD", "dot-comma")).toBe("$1.234.567,89");
    expect(formatCentsValue(1_234_567_89, "USD", "space-dot")).toBe("$1 234 567.89");
  });

  test("does not crash on huge values", () => {
    expect(formatCentsValue(1_000_000_000_00, "USD")).toBe("$1,000,000,000.00");
  });
});
