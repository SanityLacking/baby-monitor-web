<script>
  /**
   * @type {{
   *   phase: string,
   *   hasStream: boolean,
   *   mutedHint: boolean,
   *   onListen: () => void,
   *   onDisconnect: () => void,
   *   onUnpair: () => void,
   * }}
   */
  let { phase, hasStream, mutedHint, onListen, onDisconnect, onUnpair } = $props();

  const listening = $derived(phase === 'connected');
</script>

<section class="listen" data-active={listening} aria-labelledby="listen-title">
  <div class="orb" aria-hidden="true">
    <span class="ring r1"></span>
    <span class="ring r2"></span>
    <span class="core"></span>
  </div>

  <div class="copy">
    <h2 id="listen-title">{listening ? 'Live audio' : 'Ready to listen'}</h2>
    <p>
      {#if listening}
        Audio is flowing from the Monitor over a private WebRTC link. Media never
        goes through the signaling server.
      {:else if phase === 'connecting' || phase === 'reconnecting'}
        Negotiating with the Monitor. Keep this tab open — reconnect is automatic.
      {:else}
        You’re paired. Start listening when the Monitor is online.
      {/if}
    </p>
  </div>

  <div class="actions">
    {#if mutedHint || (hasStream && !listening)}
      <button type="button" class="primary" onclick={onListen}>
        {mutedHint ? 'Tap to unmute' : 'Listen'}
      </button>
    {:else if listening}
      <button type="button" class="primary quiet" onclick={onListen}>
        Replay / unmute
      </button>
    {:else}
      <button type="button" class="primary" onclick={onListen}>
        Start listening
      </button>
    {/if}
    <button type="button" class="ghost" onclick={onDisconnect}>Disconnect</button>
    <button type="button" class="ghost danger" onclick={onUnpair}>Unpair</button>
  </div>
</section>

<style>
  .listen {
    display: grid;
    gap: 1.35rem;
    justify-items: start;
    padding: 0.5rem 0 0;
  }

  .orb {
    position: relative;
    width: min(220px, 55vw);
    height: min(220px, 55vw);
    display: grid;
    place-items: center;
  }

  .ring,
  .core {
    position: absolute;
    border-radius: 50%;
  }

  .core {
    width: 42%;
    height: 42%;
    background:
      radial-gradient(circle at 35% 30%, #c8e6d4, #3d6b5a 70%);
    box-shadow: 0 12px 40px rgba(61, 107, 90, 0.35);
  }

  .ring {
    border: 1.5px solid rgba(61, 107, 90, 0.28);
  }

  .r1 {
    inset: 8%;
  }

  .r2 {
    inset: 0;
  }

  .listen[data-active='true'] .core {
    animation: breathe 2.8s ease-in-out infinite;
  }

  .listen[data-active='true'] .r1 {
    animation: ripple 2.8s ease-out infinite;
  }

  .listen[data-active='true'] .r2 {
    animation: ripple 2.8s ease-out 0.7s infinite;
  }

  .copy h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 4vw, 2.35rem);
    font-weight: 650;
    letter-spacing: -0.03em;
  }

  .copy p {
    margin: 0;
    max-width: 34rem;
    color: var(--ink-soft);
    font-size: 1.05rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .primary,
  .ghost {
    border-radius: 999px;
    padding: 0.75rem 1.25rem;
    font-weight: 650;
    border: 1px solid transparent;
  }

  .primary {
    background: var(--sage);
    color: #f4f7f4;
    border-color: var(--sage);
  }

  .primary.quiet {
    background: transparent;
    color: var(--sage);
    border-color: rgba(61, 107, 90, 0.35);
  }

  .ghost {
    background: transparent;
    color: var(--ink-soft);
    border-color: var(--line);
  }

  .ghost.danger {
    color: var(--danger);
    border-color: rgba(155, 61, 61, 0.3);
  }

  @keyframes breathe {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.06);
    }
  }

  @keyframes ripple {
    0% {
      transform: scale(0.92);
      opacity: 0.7;
    }
    100% {
      transform: scale(1.08);
      opacity: 0;
    }
  }
</style>
