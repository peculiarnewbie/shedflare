import { createMemo, createEffect, createSignal, onCleanup } from "solid-js";
import { settingsCollection } from "./collections";

type CurrencyCode = "USD" | "IDR";

function getSettingValue(key: string): string | undefined {
  const setting = settingsCollection.state.get(key) as { key: string; value: string } | undefined;
  return setting?.value;
}

export function useCurrency() {
  const [currency, setCurrency] = createSignal<CurrencyCode>("USD");

  createEffect(() => {
    function syncCurrency() {
      const raw = getSettingValue("display_currency");
      if (raw === "IDR" || raw === "USD") setCurrency(raw);
    }

    syncCurrency();
    const unsub = settingsCollection.subscribeChanges(syncCurrency);
    onCleanup(() => unsub.unsubscribe());
  });

  return createMemo(() => {
    const cur = currency();
    return {
      code: cur,
      formatCents: (cents: number): string => {
        const abs = Math.abs(cents);
        const sign = cents < 0 ? "-" : "";
        if (cur === "IDR") {
          return `${sign}Rp${Math.round(abs / 100).toLocaleString("id-ID")}`;
        }
        return `${sign}$${(abs / 100).toFixed(2)}`;
      },
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
