<script>
  /**
   * @type {{
   *   busy: boolean,
   *   error: string | null,
   *   onClaimCode: (code: string, token: string) => Promise<void>,
   *   onClaimJson: (raw: string) => Promise<void>,
   * }}
   */
  let { busy, error, onClaimCode, onClaimJson } = $props();

  let code = $state('');
  let token = $state('');
  let json = $state('');
  let mode = $state(/** @type {'code' | 'json'} */ ('json'));

  async function submitCode(e) {
    e.preventDefault();
    await onClaimCode(code.trim(), token.trim());
  }

  async function submitJson(e) {
    e.preventDefault();
    await onClaimJson(json.trim());
  }
</script>

<section class="pair" aria-labelledby="pair-title">
  <header>
    <h2 id="pair-title">Pair with a Monitor</h2>
    <p>
      On the phone Monitor, show the QR or copy the pairing JSON. Paste it here,
      or enter the short code plus pairing token.
    </p>
  </header>

  <div class="tabs" role="tablist" aria-label="Pairing method">
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'json'}
      class:active={mode === 'json'}
      onclick={() => (mode = 'json')}
    >
      Paste payload
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'code'}
      class:active={mode === 'code'}
      onclick={() => (mode = 'code')}
    >
      Code + token
    </button>
  </div>

  {#if mode === 'json'}
    <form class="form" onsubmit={submitJson}>
      <label>
        Pairing JSON
        <textarea
          rows="5"
          bind:value={json}
          placeholder={'{"v":1,"roomId":"…","token":"…","code":"AB3K9Q","signaling":"wss://…/ws"}'}
          spellcheck="false"
          disabled={busy}
        ></textarea>
      </label>
      <button type="submit" class="primary" disabled={busy || !json.trim()}>
        {busy ? 'Claiming…' : 'Claim & connect'}
      </button>
    </form>
  {:else}
    <form class="form" onsubmit={submitCode}>
      <label>
        Short code
        <input
          bind:value={code}
          maxlength="8"
          autocomplete="off"
          autocapitalize="characters"
          placeholder="AB3K9Q"
          disabled={busy}
        />
      </label>
      <label>
        Pairing token
        <input
          bind:value={token}
          autocomplete="off"
          spellcheck="false"
          placeholder="From monitor QR JSON token field"
          disabled={busy}
        />
      </label>
      <button
        type="submit"
        class="primary"
        disabled={busy || !code.trim() || !token.trim()}
      >
        {busy ? 'Claiming…' : 'Claim with code + token'}
      </button>
    </form>
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

  .error {
    margin: 0;
    color: var(--danger);
    font-weight: 550;
  }
</style>
