/**
 * Settings page — currency, budget type, exchange rate, export.
 */
import { createSignal, createEffect, Show } from "solid-js";
import { dispatch } from "../lib/pending-ops";

export default function SettingsPage() {
  const [exchangeRate, setExchangeRate] = createSignal(16000);
  const [budgetType, setBudgetType] = createSignal<"envelope" | "tracking">("envelope");
  const [currency, setCurrency] = createSignal("USD");
  const [loading, setLoading] = createSignal(true);

  createEffect(() => {
    void loadSettings();
  });

  async function loadSettings() {
    try {
      // Load current settings
      const ratesRes = await fetch("/api/rates");
      if (ratesRes.ok) {
        const data = await ratesRes.json() as any;
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

  function handleExport() {
    // Simple CSV export of all transactions
    window.location.href = "/api/export/csv";
  }

  return (
    <div class="page">
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Configure your budget preferences</p>

      <Show when={!loading()} fallback={<div class="loading">Loading...</div>}>
        {/* Exchange Rate */}
        <div class="settings-section">
          <h2>Exchange Rate</h2>
          <p class="settings-description">1 USD to IDR conversion rate for dual-currency display.</p>
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
              classList={{ "btn-primary": budgetType() === "envelope", "btn-secondary": budgetType() !== "envelope" }}
              onClick={() => setBudgetType("envelope")}
            >
              Envelope Budget
            </button>
            <button
              class="btn"
              classList={{ "btn-primary": budgetType() === "tracking", "btn-secondary": budgetType() !== "tracking" }}
              onClick={() => setBudgetType("tracking")}
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
            onChange={(e) => setCurrency(e.currentTarget.value)}
            style="max-width:200px"
          >
            <option value="USD">USD ($)</option>
            <option value="IDR">IDR (Rp)</option>
          </select>
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
