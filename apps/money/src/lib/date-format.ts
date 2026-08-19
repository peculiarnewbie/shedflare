import { createMemo, createEffect, createSignal, onCleanup } from "solid-js";
import { parseCalendarDate } from "../domain/types";
import { settingsCollection } from "./settings-store";

type DateFormat = "iso" | "us" | "eu";

function getSettingValue(key: string): string | undefined {
  const setting = settingsCollection.state.get(key);
  return setting?.value;
}

interface DateParts {
  y: number;
  m: string;
  day: string;
}

function partsFromDate(d: Date): DateParts {
  return {
    y: d.getFullYear(),
    m: String(d.getMonth() + 1).padStart(2, "0"),
    day: String(d.getDate()).padStart(2, "0"),
  };
}

function formatParts(format: DateFormat, y: number, m: string, day: string): string {
  switch (format) {
    case "us":
      return `${m}/${day}/${y}`;
    case "eu":
      return `${day}/${m}/${y}`;
    default:
      return `${y}-${m}-${day}`;
  }
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
    const calendar = parseCalendarDate(isoDate.slice(0, 10));
    if (calendar) {
      const { y, m, day } = partsFromDate(calendar);
      return formatParts(format(), y, m, day);
    }
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    const { y, m, day } = partsFromDate(d);
    return formatParts(format(), y, m, day);
  }

  return createMemo(() => ({
    format: format(),
    formatDate,
    localeDateFormat: (date: Date): string => {
      const { y, m, day } = partsFromDate(date);
      return formatParts(format(), y, m, day);
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
