import { createMemo, createEffect, createSignal, onCleanup } from "solid-js";
import { settingsCollection } from "./settings-store";

type DateFormat = "iso" | "us" | "eu";

function getSettingValue(key: string): string | undefined {
  const setting = settingsCollection.state.get(key) as { key: string; value: string } | undefined;
  return setting?.value;
}

export function useDateFormat() {
  const [format, setFormat] = createSignal<DateFormat>("iso");

  createEffect(() => {
    function sync() {
      const raw = getSettingValue("date_format");
      if (raw === "us" || raw === "eu" || raw === "iso") setFormat(raw);
    }

    sync();
    const unsub = settingsCollection.subscribeChanges(sync);
    onCleanup(() => unsub.unsubscribe());
  });

  function formatDate(isoDate: string | null | undefined): string {
    if (!isoDate) return "—";
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    switch (format()) {
      case "us":
        return `${m}/${day}/${y}`;
      case "eu":
        return `${day}/${m}/${y}`;
      default:
        return `${y}-${m}-${day}`;
    }
  }

  return createMemo(() => ({
    format: format(),
    formatDate,
    localeDateFormat: (date: Date): string => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      switch (format()) {
        case "us":
          return `${m}/${day}/${y}`;
        case "eu":
          return `${day}/${m}/${y}`;
        default:
          return `${y}-${m}-${day}`;
      }
    },
    formatMonth: (monthKey: string): string => {
      const [y, m] = monthKey.split("-").map(Number);
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      return `${months[m - 1]} ${y}`;
    },
  }));
}
