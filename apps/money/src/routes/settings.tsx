/**
 * Settings page — currency, budget type, exchange rate, export, privacy, display.
 */
import { createSignal, createEffect, Show, onCleanup } from "solid-js";
import { dispatch } from "../lib/pending-ops";
import { settingsCollection } from "../lib/collections";
import { usePrivacyMode } from "../lib/privacy";

type BudgetType = "envelope" | "tracking";
type Currency = "USD" | "IDR";
type DateFormat = "iso" | "us" | "eu";

export default function SettingsPage() {
  const [exchangeRate, setExchangeRate] = createSignal(16000);
  const [budgetType, setBudgetType] = createSignal<BudgetType>("envelope");
  const [currency, setCurrency] = createSignal<Currency>("USD");
  const [loading, setLoading] = createSignal(true);
  const privacy = usePrivacyMode();

  const [dateFormat, setDateFormat] = createSignal<DateFormat>("iso");
  const [hideClosed, setHideClosed] = createSignal(false);

  createEffect(() => {
    void loadSettings();
  });

  createEffect(() => {
    syncPersistedSettings();
    const unsub = settingsCollection.subscribeChanges(syncPersistedSettings);
    onCleanup(() => unsub.unsubscribe());
  });

  function syncPersistedSettings() {
    const budgetTypeSetting = settingsCollection.state.get("budget_type")?.value;
    if (budgetTypeSetting === "envelope" || budgetTypeSetting === "tracking") {
      setBudgetType(budgetTypeSetting);
    }

    const currencySetting = settingsCollection.state.get("display_currency")?.value;
    if (currencySetting === "USD" || currencySetting === "IDR") {
      setCurrency(currencySetting);
    }

    const privacySetting = settingsCollection.state.get("privacy_mode")?.value;
    if (privacySetting === "true" || privacySetting === "false") {
      // privacy signal reacts to settings collection directly
    }

    const df = settingsCollection.state.get("date_format")?.value;
    if (df === "us" || df === "eu" || df === "iso") {
      setDateFormat(df);
    }

    const hc = settingsCollection.state.get("hide_closed_accounts")?.value;
    if (hc === "true") setHideClosed(true);
    else setHideClosed(false);
  }

  async function loadSettings() {
    try {
      const ratesRes = await fetch("/api/rates");
      if (ratesRes.ok) {
        const data = (await ratesRes.json()) as any;
        setExchangeRate(data.usdToIdr ?? 16000);
      }
    } catch {
      // Will work once sync is connected
    } finally {
      setLoading(false);
    }
  }

  function handleRateUpdate() {
    dispatch("update_exchange_rate", { usdToIdr: Math.round(exchangeRate()) });
  }

  function updateBudgetType(value: BudgetType) {
    setBudgetType(value);
    dispatch("update_setting", { key: "budget_type", value });
  }

  function updateCurrency(value: Currency) {
    setCurrency(value);
    dispatch("update_setting", { key: "display_currency", value });
  }

  function updateDateFormat(value: DateFormat) {
    setDateFormat(value);
    dispatch("update_setting", { key: "date_format", value });
  }

  function togglePrivacy() {
    dispatch("update_setting", { key: "privacy_mode", value: String(!privacy().enabled) });
  }

  function toggleHideClosed() {
    const next = !hideClosed();
    setHideClosed(next);
    dispatch("update_setting", { key: "hide_closed_accounts", value: String(next) });
  }

  function handleExport() {
    window.location.href = "/api/export/csv";
  }

  return (
    <div class="page">
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Configure your budget preferences</p>

      <Show when={!loading()} fallback={<div class="loading">Loading...</div>}>
        {/* Privacy Mode */}
        <div class="settings-section">
          <h2>Privacy Mode</h2>
          <p class="settings-description">
            Blur all monetary amounts to keep them hidden from onlookers.
          </p>
          <div class="privacy-toggle">
            <input
              type="checkbox"
              id="privacy-toggle"
              checked={privacy().enabled}
              onChange={togglePrivacy}
            />
            <label for="privacy-toggle">
              {privacy().enabled ? "Amounts are hidden" : "Amounts are visible"}
            </label>
          </div>
        </div>

        {/* Exchange Rate */}
        <div class="settings-section">
          <h2>Exchange Rate</h2>
          <p class="settings-description">
            1 USD to IDR conversion rate for dual-currency display.
          </p>
          <div class="inline-form">
            <input
              type="number"
              value={exchangeRate()}
              onInput={(e) => setExchangeRate(parseInt(e.currentTarget.value) || 0)}
              min="1"
              style="max-width:200px"
            />
            <button class="btn btn-primary btn-sm" onClick={handleRateUpdate}>
              Update
            </button>
          </div>
        </div>

        {/* Budget Type */}
        <div class="settings-section">
          <h2>Budget Type</h2>
          <p class="settings-description">
            Envelope: assign available money to categories. Tracking: set spending targets.
          </p>
          <div class="settings-options">
            <button
              class="btn"
              classList={{
                "btn-primary": budgetType() === "envelope",
                "btn-secondary": budgetType() !== "envelope",
              }}
              onClick={() => updateBudgetType("envelope")}
            >
              Envelope Budget
            </button>
            <button
              class="btn"
              classList={{
                "btn-primary": budgetType() === "tracking",
                "btn-secondary": budgetType() !== "tracking",
              }}
              onClick={() => updateBudgetType("tracking")}
            >
              Tracking Budget
            </button>
          </div>
        </div>

        {/* Display Currency */}
        <div class="settings-section">
          <h2>Display Currency</h2>
          <p class="settings-description">Choose your primary display currency.</p>
          <select
            value={currency()}
            onChange={(e) => updateCurrency(e.currentTarget.value as Currency)}
            style="max-width:200px"
          >
            <option value="USD">USD ($)</option>
            <option value="IDR">IDR (Rp)</option>
          </select>
        </div>

        {/* Date Format */}
        <div class="settings-section">
          <h2>Date Format</h2>
          <p class="settings-description">Choose how dates are displayed throughout the app.</p>
          <select
            value={dateFormat()}
            onChange={(e) => updateDateFormat(e.currentTarget.value as DateFormat)}
            style="max-width:200px"
          >
            <option value="iso">ISO (2026-05-13)</option>
            <option value="us">US (05/13/2026)</option>
            <option value="eu">EU (13/05/2026)</option>
          </select>
        </div>

        {/* Account Display */}
        <div class="settings-section">
          <h2>Account Display</h2>
          <p class="settings-description">Control which accounts appear in the account list.</p>
          <div class="form-check">
            <input
              type="checkbox"
              id="hide-closed"
              checked={hideClosed()}
              onChange={toggleHideClosed}
            />
            <label for="hide-closed">Hide closed accounts</label>
          </div>
        </div>

        {/* Export */}
        <div class="settings-section">
          <h2>Export Data</h2>
          <p class="settings-description">Download your transactions as a CSV file.</p>
          <button class="btn btn-secondary" onClick={handleExport}>
            Export CSV
          </button>
        </div>
      </Show>
    </div>
  );
}
