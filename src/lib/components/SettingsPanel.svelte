<script>
  import { DEFAULT_SIGNALING_BASE } from '../config.js';

  /**
   * @type {{
   *   baseUrl: string,
   *   health: string | null,
   *   healthBusy: boolean,
   *   open: boolean,
   *   onToggle: () => void,
   *   onSave: (url: string) => void,
   *   onTestHealth: () => void,
   * }}
   */
  let { baseUrl, health, healthBusy, open, onToggle, onSave, onTestHealth } =
    $props();

  let draft = $state('');

  // Keep the draft field in sync when the parent saves a new base URL.
  $effect(() => {
    draft = baseUrl;
  });

  function save(e) {
    e.preventDefault();
    onSave(draft.trim());
  }

  function resetDefault() {
    draft = DEFAULT_SIGNALING_BASE;
    onSave(DEFAULT_SIGNALING_BASE);
  }
</script>

<section class="settings" aria-labelledby="settings-title">
  <button type="button" class="head" onclick={onToggle} aria-expanded={open}>
    <h2 id="settings-title">Signaling</h2>
    <span>{open ? 'Hide' : 'Show'}</span>
  </button>

  {#if open}
    <form class="body" onsubmit={save}>
      <label>
        Base URL
        <input
          bind:value={draft}
          spellcheck="false"
          autocomplete="off"
          placeholder={DEFAULT_SIGNALING_BASE}
        />
      </label>
      <p class="hint">
        Default is the live Render service. Free-tier cold starts can take
        30–60s on first request.
      </p>
      <div class="row">
        <button type="submit" class="primary">Save</button>
        <button type="button" class="ghost" onclick={onTestHealth} disabled={healthBusy}>
          {healthBusy ? 'Checking…' : 'Test /health'}
        </button>
        <button type="button" class="ghost" onclick={resetDefault}>Use live default</button>
      </div>
      {#if health}
        <p class="health" class:ok={health.startsWith('ok')} role="status">{health}</p>
      {/if}
    </form>
  {/if}
</section>

<style>
  .settings {
    border-top: 1px solid var(--line);
    padding-top: 1rem;
    margin-top: 1.5rem;
  }

  .head {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    border: 0;
    background: transparent;
    padding: 0;
    color: inherit;
  }

  .head h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 650;
  }

  .head span {
    color: var(--ink-soft);
    font-size: 0.9rem;
  }

  .body {
    display: grid;
    gap: 0.75rem;
    margin-top: 0.85rem;
    max-width: 36rem;
  }

  label {
    display: grid;
    gap: 0.35rem;
    font-size: 0.9rem;
    font-weight: 550;
    color: var(--ink-soft);
  }

  input {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 0.7rem 0.85rem;
    background: rgba(255, 255, 255, 0.7);
  }

  .hint {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-soft);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .primary,
  .ghost {
    border-radius: 999px;
    padding: 0.55rem 1rem;
    font-weight: 600;
  }

  .primary {
    border: 0;
    background: var(--sage);
    color: #f4f7f4;
  }

  .ghost {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--ink-soft);
  }

  .health {
    margin: 0;
    font-size: 0.9rem;
    color: var(--danger);
    word-break: break-word;
  }

  .health.ok {
    color: var(--ok);
  }
</style>
