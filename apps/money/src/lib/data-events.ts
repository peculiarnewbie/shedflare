export const MONEY_DATA_CHANGED_EVENT = "money:data-changed";

export function emitMoneyDataChanged(): void {
  window.dispatchEvent(new Event(MONEY_DATA_CHANGED_EVENT));
}

export function listenForMoneyDataChanged(refresh: () => void | Promise<void>): () => void {
  const listener = () => {
    void refresh();
  };
  window.addEventListener(MONEY_DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(MONEY_DATA_CHANGED_EVENT, listener);
}
