<script>
  /**
   * @typedef {'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'signaling'} StatusKind
   * @type {{
   *   phase: StatusKind,
   *   signalingConnected: boolean,
   *   detail?: string | null,
   * }}
   */
  let { phase, signalingConnected, detail = null } = $props();

  const label = $derived.by(() => {
    if (phase === 'connected') return 'Listening';
    if (phase === 'connecting') return 'Connecting';
    if (phase === 'reconnecting') return 'Reconnecting';
    if (phase === 'error') return 'Error';
    if (signalingConnected) return 'On signaling';
    return 'Idle';
  });

  const tone = $derived.by(() => {
    if (phase === 'connected') return 'ok';
    if (phase === 'error') return 'err';
    if (phase === 'connecting' || phase === 'reconnecting') return 'busy';
    if (signalingConnected) return 'sig';
    return 'idle';
  });
</script>

<div class="status" data-tone={tone} role="status">
  <span class="dot" aria-hidden="true"></span>
  <div class="text">
    <strong>{label}</strong>
    {#if detail}
      <span>{detail}</span>
    {:else if signalingConnected && phase !== 'connected'}
      <span>WebSocket open · waiting for media</span>
    {:else if phase === 'idle'}
      <span>Pair with a Monitor to begin</span>
    {/if}
  </div>
</div>

<style>
  .status {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    backdrop-filter: blur(10px);
    max-width: 36rem;
  }

  .dot {
    width: 0.7rem;
    height: 0.7rem;
    margin-top: 0.35rem;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--ink-soft);
  }

  .status[data-tone='ok'] .dot {
    background: var(--ok);
    box-shadow: 0 0 0 4px rgba(47, 107, 79, 0.18);
  }

  .status[data-tone='busy'] .dot {
    background: var(--warn);
    animation: blink 1.1s ease-in-out infinite;
  }

  .status[data-tone='err'] .dot {
    background: var(--danger);
  }

  .status[data-tone='sig'] .dot {
    background: var(--sage-bright);
  }

  .text {
    display: grid;
    gap: 0.1rem;
  }

  .text strong {
    font-weight: 650;
    letter-spacing: 0.01em;
  }

  .text span {
    font-size: 0.9rem;
    color: var(--ink-soft);
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
</style>
