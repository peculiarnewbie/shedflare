import { Show, createSignal } from "solid-js";
import { requestJson, useDrive } from "../context";
import {
  SecureUploadCommandResponse,
  type SecureUploadCommandResponse as SecureUploadCommandResponseType,
} from "../types";

const expiryOptions = [
  { seconds: 120, label: "2 minutes" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 600, label: "10 minutes" },
];

export default function SecureUploadCommand() {
  const ctx = useDrive();
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [expiresInSeconds, setExpiresInSeconds] = createSignal(120);
  const [result, setResult] = createSignal<SecureUploadCommandResponseType | null>(null);

  async function createCommand() {
    setOpen(true);
    setBusy(true);
    try {
      const command = await requestJson(
        "/api/secure-uploads/command",
        SecureUploadCommandResponse,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expiresInSeconds: expiresInSeconds() }),
        },
      );
      setResult(command);
    } catch (cause) {
      setResult(null);
      ctx.addToast(
        cause instanceof Error ? cause.message : "Could not create an upload command",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyCommand() {
    const command = result()?.command;
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      ctx.addToast("Secure upload command copied", "success");
    } catch {
      ctx.addToast("Select and copy the command manually", "info");
    }
  }

  return (
    <>
      <button
        type="button"
        class="btn top-bar-signout secure-command-trigger"
        onClick={() => void createCommand()}
      >
        <span class="secure-command-label-long">Create secure upload command</span>
        <span class="secure-command-label-short">Upload command</span>
      </button>

      <Show when={open()}>
        <div
          class="modal-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            class="secure-command-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="secure-command-title"
          >
            <div class="secure-command-heading">
              <div>
                <h3 id="secure-command-title">Secure upload command</h3>
                <p>
                  Replace <code>&lt;path-to-file&gt;</code>, then run the command. Uploads are
                  private and limited to 500 MB.
                </p>
              </div>
              <button
                type="button"
                class="secure-command-close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <Show
              when={result()}
              fallback={<div class="secure-command-loading">Creating a short-lived command…</div>}
            >
              {(command) => (
                <>
                  <textarea
                    class="secure-command-value"
                    readOnly
                    rows={4}
                    value={command().command}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <p class="secure-command-expiry">
                    New uploads must start before{" "}
                    {new Date(command().expiresAt).toLocaleTimeString()}. A started upload can
                    finish after that.
                  </p>
                </>
              )}
            </Show>

            <div class="secure-command-actions">
              <label>
                Valid for
                <select
                  value={expiresInSeconds()}
                  disabled={busy()}
                  onChange={(event) => setExpiresInSeconds(Number(event.currentTarget.value))}
                >
                  {expiryOptions.map((option) => (
                    <option value={option.seconds}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                class="btn"
                disabled={busy()}
                onClick={() => void createCommand()}
              >
                {busy() ? "Creating…" : "Create new"}
              </button>
              <button
                type="button"
                class="btn btn-primary"
                disabled={busy() || !result()}
                onClick={() => void copyCommand()}
              >
                Copy command
              </button>
            </div>
          </section>
        </div>
      </Show>
    </>
  );
}
