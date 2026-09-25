<script>
  /**
   * @type {{
   *   busy: boolean,
   *   waiting: boolean,
   *   statusMessage: string | null,
   *   error: string | null,
   *   onClaimCode: (code: string, deviceLabel: string) => Promise<void>,
   *   onClaimJson: (raw: string, deviceLabel: string) => Promise<void>,
   *   onCancel: () => void,
   * }}
   */
  let {
    busy,
    waiting,
    statusMessage,
    error,
    onClaimCode,
    onClaimJson,
    onCancel,
  } = $props();

  let code = $state('');
  let deviceLabel = $state('');
  let json = $state('');
  let mode = $state(/** @type {'code' | 'json'} */ ('code'));

  async function submitCode(e) {
    e.preventDefault();
    await onClaimCode(code.trim(), deviceLabel.trim());
  }

  async function submitJson(e) {
    e.preventDefault();
    await onClaimJson(json.trim(), deviceLabel.trim());
  }
</script>

<section class="pair" aria-labelledby="pair-title">
  <header>
    <h2 id="pair-title">Pair with a Monitor</h2>
    <p>
      Enter the 5-character code from the phone Monitor. The monitor must tap
      <strong>Accept</strong> before this viewer gets a session — nothing binds
      until then.
    </p>
  </header>

  {#if waiting}
    <div class="waiting" role="status" aria-live="polite">
      <p class="waiting-title">Waiting for the monitor to Accept…</p>
      {#if statusMessage}
        <p class="waiting-detail">{statusMessage}</p>
      {/if}
      <button type="button" class="ghost" onclick={onCancel}>Cancel</button>
    </div>
  {:else}
    <div class="tabs" role="tablist" aria-label="Pairing method">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'code'}
        class:active={mode === 'code'}
        onclick={() => (mode = 'code')}
      >
        Enter code
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'json'}
        class:active={mode === 'json'}
        onclick={() => (mode = 'json')}
      >
        Paste QR JSON
      </button>
    </div>

    {#if mode === 'code'}
      <form class="form" onsubmit={submitCode}>
        <label>
          Short code
          <input
            bind:value={code}
            maxlength="8"
            autocomplete="off"
            autocapitalize="characters"
            placeholder="K7M2Q"
            disabled={busy}
          />
        </label>
        <label>
          Device name <span class="optional">(optional)</span>
          <input
            bind:value={deviceLabel}
            autocomplete="off"
            placeholder="Cailen's laptop"
            disabled={busy}
          />
        </label>
        <button type="submit" class="primary" disabled={busy || !code.trim()}>
          {busy ? 'Sending…' : 'Request pairing'}
        </button>
      </form>
    {:else}
      <form class="form" onsubmit={submitJson}>
        <label>
          Pairing JSON
          <textarea
            rows="5"
            bind:value={json}
            placeholder={'{"v":2,"code":"K7M2Q","roomId":"…","signaling":"wss://…/ws"}'}
            spellcheck="false"
            disabled={busy}
          ></textarea>
        </label>
        <label>
          Device name <span class="optional">(optional)</span>
          <input
            bind:value={deviceLabel}
            autocomplete="off"
            placeholder="Cailen's laptop"
            disabled={busy}
          />
        </label>
        <button type="submit" class="primary" disabled={busy || !json.trim()}>
          {busy ? 'Sending…' : 'Request pairing'}
        </button>
      </form>
    {/if}
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</section>

<style>
  .pair {
    display: grid;
    gap: 1rem;
    max-width: 34rem;
  }

  header h2 {
    margin: 0 0 0.35rem;
    font-family: var(--font-display);
    font-size: 1.55rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  header p {
    margin: 0;
    color: var(--ink-soft);
  }

  .tabs {
    display: inline-flex;
    gap: 0.25rem;
    padding: 0.25rem;
    border-radius: 999px;
    background: rgba(26, 36, 32, 0.06);
    width: fit-content;
  }

  .tabs button {
    border: 0;
    background: transparent;
    color: var(--ink-soft);
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    font-weight: 550;
  }

  .tabs button.active {
    background: var(--surface-solid);
    color: var(--ink);
    box-shadow: 0 1px 2px rgba(26, 36, 32, 0.08);
  }

  .form {
    display: grid;
    gap: 0.85rem;
  }

  label {
    display: grid;
    gap: 0.35rem;
    font-size: 0.9rem;
    font-weight: 550;
    color: var(--ink-soft);
  }

  .optional {
    font-weight: 450;
    opacity: 0.75;
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 0.75rem 0.9rem;
    background: rgba(255, 255, 255, 0.7);
    color: var(--ink);
    resize: vertical;
  }

  .primary {
    justify-self: start;
    border: 0;
    border-radius: 999px;
    padding: 0.75rem 1.35rem;
    background: var(--sage);
    color: #f4f7f4;
    font-weight: 650;
    transition: transform 160ms ease, background 160ms ease;
  }

  .primary:hover:not(:disabled) {
    background: var(--sage-bright);
    transform: translateY(-1px);
  }

  .primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .waiting {
    display: grid;
    gap: 0.65rem;
    padding: 1.1rem 1.2rem;
    border: 1px dashed var(--line);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.45);
  }

  .waiting-title {
    margin: 0;
    font-weight: 650;
    color: var(--ink);
  }

  .waiting-detail {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.95rem;
  }

  .ghost {
    justify-self: start;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.55rem 1.1rem;
    background: transparent;
    color: var(--ink-soft);
    font-weight: 550;
  }

  .ghost:hover {
    color: var(--ink);
    border-color: var(--ink-soft);
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-weight: 550;
  }
</style>
