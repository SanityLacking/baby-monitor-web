<script>
  /**
   * @typedef {{ kind: string, level?: number, message: string, at?: string, id: string }} AlertItem
   * @type {{
   *   alerts: AlertItem[],
   *   onDismiss: (id: string) => void,
   * }}
   */
  let { alerts, onDismiss } = $props();
</script>

{#if alerts.length}
  <aside class="alerts" aria-live="polite" aria-label="Sound alerts">
    {#each alerts as alert (alert.id)}
      <div class="alert">
        <div class="pulse" aria-hidden="true"></div>
        <div class="body">
          <strong>{alert.message}</strong>
          <span>
            {alert.kind}
            {#if alert.level != null}
              · level {alert.level.toFixed(2)}
            {/if}
            {#if alert.at}
              · {new Date(alert.at).toLocaleTimeString()}
            {/if}
          </span>
        </div>
        <button type="button" class="dismiss" onclick={() => onDismiss(alert.id)} aria-label="Dismiss alert">
          ×
        </button>
      </div>
    {/each}
  </aside>
{/if}

<style>
  .alerts {
    display: grid;
    gap: 0.65rem;
    margin-top: 1.25rem;
  }

  .alert {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.85rem 1rem;
    background: rgba(155, 61, 61, 0.08);
    border: 1px solid rgba(155, 61, 61, 0.22);
    border-radius: 14px;
    animation: rise 280ms ease-out;
  }

  .pulse {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--danger);
    box-shadow: 0 0 0 0 rgba(155, 61, 61, 0.45);
    animation: ping 1.4s ease-out infinite;
  }

  .body {
    display: grid;
    gap: 0.15rem;
  }

  .body strong {
    font-weight: 650;
  }

  .body span {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }

  .dismiss {
    border: 0;
    background: transparent;
    color: var(--ink-soft);
    font-size: 1.35rem;
    line-height: 1;
    padding: 0.15rem 0.35rem;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes ping {
    0% {
      box-shadow: 0 0 0 0 rgba(155, 61, 61, 0.45);
    }
    70% {
      box-shadow: 0 0 0 12px rgba(155, 61, 61, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(155, 61, 61, 0);
    }
  }
</style>
