import { createMemo, createEffect, createSignal, onCleanup } from "solid-js";
import { settingsCollection } from "./settings-store";

type CurrencyCode = "USD" | "IDR";
export type NumberFormat = "comma-dot" | "dot-comma" | "space-dot";

function getSettingValue(key: string): string | undefined {
  const setting = settingsCollection.state.get(key);
  return setting?.value;
}

function formatWithSeparators(
  value: number,
  decimalPlaces: number,
  thousandsSep: string,
  decimalSep: string,
): string {
  const fixed = value.toFixed(decimalPlaces);
  const [intPart, fracPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
  return fracPart ? `${withThousands}${decimalSep}${fracPart}` : withThousands;
}

const NUMBER_FORMAT_SEPS = {
  "comma-dot": { thousands: ",", decimal: "." },
  "dot-comma": { thousands: ".", decimal: "," },
  "space-dot": { thousands: " ", decimal: "." },
} satisfies Record<NumberFormat, { thousands: string; decimal: string }>;

export function formatCentsValue(
  cents: number,
  currency: CurrencyCode,
  numberFormat: NumberFormat = "comma-dot",
): string {
  const abs = Math.abs(cents);
  const sign = cents < 0 ? "-" : "";
  const seps = NUMBER_FORMAT_SEPS[numberFormat];
  if (currency === "IDR") {
    const formatted = formatWithSeparators(Math.round(abs / 100), 0, seps.thousands, seps.decimal);
    return `${sign}Rp${formatted}`;
  }
  const formatted = formatWithSeparators(abs / 100, 2, seps.thousands, seps.decimal);
  return `${sign}$${formatted}`;
}

export function useCurrency() {
  const [currency, setCurrency] = createSignal<CurrencyCode>("USD");
  const [numberFormat, setNumberFormat] = createSignal<NumberFormat>("comma-dot");

  createEffect(() => {
    function sync() {
      const raw = getSettingValue("display_currency");
      if (raw === "IDR" || raw === "USD") setCurrency(raw);
      const nf = getSettingValue("number_format");
      if (nf === "comma-dot" || nf === "dot-comma" || nf === "space-dot") setNumberFormat(nf);
    }

    sync();
    const unsub = settingsCollection.subscribeChanges(sync);
    onCleanup(() => unsub.unsubscribe());
  });

  return createMemo(() => {
    const cur = currency();
    const nf = numberFormat();

    return {
      code: cur,
      numberFormat: nf,
      formatCents: (cents: number): string => formatCentsValue(cents, cur, nf),
      formatCentsInput: (cents: number): string => {
        if (cur === "IDR") {
          return String(Math.round(cents / 100));
        }
        return (cents / 100).toFixed(2);
      },
      parseInput: (value: string): number => {
        const num = parseFloat(value.replace(/[^0-9.-]/g, ""));
        if (isNaN(num)) return 0;
        if (cur === "IDR") {
          return Math.round(num) * 100;
        }
        return Math.round(num * 100);
      },
      symbol: cur === "IDR" ? "Rp" : "$",
      locale: cur === "IDR" ? "id-ID" : "en-US",
    };
  });
}
