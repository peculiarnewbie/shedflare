import { createMemo, createEffect, createSignal, onCleanup } from "solid-js";
import { settingsCollection } from "./settings-store";

export function usePrivacyMode() {
  const [enabled, setEnabled] = createSignal(false);

  createEffect(() => {
    function sync() {
      const raw = settingsCollection.state.get("privacy_mode") as
        | { key: string; value: string }
        | undefined;
      setEnabled(raw?.value === "true");
    }

    sync();
    const unsub = settingsCollection.subscribeChanges(sync);
    onCleanup(() => unsub.unsubscribe());
  });

  return createMemo(() => ({
    enabled: enabled(),
    blurClass: () => (enabled() ? "privacy-blur" : ""),
    blurIf: (condition: boolean) => (enabled() && condition ? "privacy-blur" : ""),
  }));
}
