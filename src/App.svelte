<script>
  import { onMount } from 'svelte';
  import AlertList from './lib/components/AlertList.svelte';
  import ConnectionStatus from './lib/components/ConnectionStatus.svelte';
  import ListenSurface from './lib/components/ListenSurface.svelte';
  import PairingPanel from './lib/components/PairingPanel.svelte';
  import SettingsPanel from './lib/components/SettingsPanel.svelte';
  import { DEFAULT_SIGNALING_BASE } from './lib/config.js';
  import { PairingPayload } from './lib/pairing.js';
  import { SignalingApi, SignalingApiError } from './lib/signaling/api.js';
  import { SignalingClient } from './lib/signaling/client.js';
  import { normalizeBase, wsUrlFromBase } from './lib/signaling/urls.js';
  import {
    clearPairing,
    loadOrCreateDeviceId,
    loadPairing,
    loadSignalingBase,
    savePairing,
    saveSignalingBase,
  } from './lib/storage.js';
  import { WebrtcViewerSession } from './lib/webrtc/session.js';

  const initialSignalingBase = loadSignalingBase();
  let signalingBase = $state(initialSignalingBase);
  let deviceId = $state(loadOrCreateDeviceId());
  /** @type {PairingPayload | null} */
  let pairing = $state(loadPairing());

  let claimBusy = $state(false);
  let claimError = $state(/** @type {string | null} */ (null));
  let settingsOpen = $state(false);
  let healthText = $state(/** @type {string | null} */ (null));
  let healthBusy = $state(false);

  let sessionPhase = $state(/** @type {string} */ ('idle'));
  let sessionMessage = $state(/** @type {string | null} */ (null));
  let signalingConnected = $state(false);
  let hasStream = $state(false);
  let mutedHint = $state(false);

  /** @type {{ kind: string, level?: number, message: string, at?: string, id: string }[]} */
  let alerts = $state([]);

  /** @type {HTMLAudioElement | undefined} */
  let audioEl = $state();

  const api = new SignalingApi(initialSignalingBase);
  const signaling = new SignalingClient();
  const session = new WebrtcViewerSession({
    signaling,
    api,
    onState: () => {
      sessionPhase = session.phase;
      sessionMessage = session.message;
      hasStream = Boolean(session.remoteStream);
      mutedHint = Boolean(
        session.message &&
          /tap|unmute|gesture|play blocked/i.test(session.message),
      );
    },
    onAlert: (alert) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      alerts = [{ ...alert, id }, ...alerts].slice(0, 8);
    },
  });

  onMount(() => {
    const off = signaling.onStatus(() => {
      signalingConnected = signaling.connected;
      if (signaling.lastError && session.phase !== 'connected') {
        sessionMessage = signaling.lastError;
      }
    });

    if (pairing?.isValid) {
      void startSession(pairing);
    }

    return () => {
      off();
      void session.stop();
    };
  });

  /**
   * @param {PairingPayload} next
   */
  async function startSession(next) {
    api.setBaseUrl(signalingBase);
    const ok = await session.start({
      roomId: next.roomId,
      token: /** @type {string} */ (next.joinToken),
      deviceId,
      signalingWsUrl: next.signalingWsUrl,
      signalingBaseUrl: signalingBase,
      audioEl,
    });
    if (!ok) claimError = session.message;
  }

  /**
   * @param {string} code
   * @param {string} token
   */
  async function claimWithCode(code, token) {
    claimError = null;
    if (!code || !token) {
      claimError = 'Short code and pairing token are both required.';
      return;
    }
    claimBusy = true;
    try {
      api.setBaseUrl(signalingBase);
      const claimed = await api.claimRoom({
        code,
        pairingToken: token,
        deviceId,
      });
      const next = new PairingPayload({
        roomId: claimed.roomId,
        pairingToken: token,
        sessionToken: claimed.sessionToken,
        signalingWsUrl: claimed.signalingWsUrl,
        signalingBaseUrl: signalingBase,
        shortCode: code.toUpperCase(),
      });
      savePairing(next);
      pairing = next;
      await startSession(next);
    } catch (e) {
      claimError =
        e instanceof SignalingApiError
          ? e.message
          : `Claim failed: ${e instanceof Error ? e.message : e}`;
    } finally {
      claimBusy = false;
    }
  }

  /** @param {string} raw */
  async function claimWithJson(raw) {
    claimError = null;
    claimBusy = true;
    try {
      const payload = PairingPayload.decode(raw);
      if (!payload.pairingToken && !payload.sessionToken) {
        throw new Error('Payload needs token or sessionToken');
      }
      api.setBaseUrl(signalingBase);

      let next = payload;
      if (payload.pairingToken && !payload.sessionToken) {
        const claimed = await api.claimRoom({
          pairingToken: payload.pairingToken,
          roomId: payload.roomId || undefined,
          code: payload.shortCode || undefined,
          deviceId,
        });
        next = new PairingPayload({
          version: payload.version,
          roomId: claimed.roomId || payload.roomId,
          pairingToken: payload.pairingToken,
          sessionToken: claimed.sessionToken,
          signalingWsUrl: claimed.signalingWsUrl,
          signalingBaseUrl: signalingBase,
          shortCode: payload.shortCode,
        });
      } else if (!payload.signalingWsUrl) {
        next = payload.with({
          signalingWsUrl: wsUrlFromBase(signalingBase),
          signalingBaseUrl: signalingBase,
        });
      }

      if (!next.isValid) throw new Error('Incomplete pairing payload after claim');
      savePairing(next);
      pairing = next;
      await startSession(next);
    } catch (e) {
      claimError =
        e instanceof SignalingApiError
          ? e.message
          : `Could not pair: ${e instanceof Error ? e.message : e}`;
    } finally {
      claimBusy = false;
    }
  }

  /** @param {string} url */
  function saveBase(url) {
    const next = normalizeBase(url) || DEFAULT_SIGNALING_BASE;
    signalingBase = next;
    saveSignalingBase(next);
    api.setBaseUrl(next);
    healthText = null;
  }

  async function testHealth() {
    healthBusy = true;
    healthText = null;
    try {
      api.setBaseUrl(signalingBase);
      const body = await api.getHealth();
      healthText = `ok · ${body.service || 'signaling'} · rooms ${body.rooms ?? '?'} · connections ${body.connections ?? '?'}`;
    } catch (e) {
      healthText =
        e instanceof SignalingApiError
          ? e.message
          : `Health check failed: ${e instanceof Error ? e.message : e}`;
    } finally {
      healthBusy = false;
    }
  }

  async function listen() {
    await session.resumeAudio();
    if (pairing?.isValid && session.phase === 'idle') {
      await startSession(pairing);
    }
  }

  async function disconnect() {
    await session.stop();
  }

  async function unpair() {
    if (pairing?.joinToken && pairing.roomId) {
      try {
        api.setBaseUrl(signalingBase);
        await api.revokeRoom(pairing.roomId, {
          token: pairing.joinToken,
          role: 'viewer',
        });
      } catch {
        /* local clear still proceeds */
      }
    }
    await session.stop();
    clearPairing();
    pairing = null;
    alerts = [];
    claimError = null;
  }

  /** @param {string} id */
  function dismissAlert(id) {
    alerts = alerts.filter((a) => a.id !== id);
  }

  const statusPhase = $derived(
    /** @type {'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'signaling'} */ (
      sessionPhase === 'idle' && signalingConnected
        ? 'signaling'
        : sessionPhase
    ),
  );
</script>

<audio bind:this={audioEl} autoplay playsinline class="sr-only"></audio>

<div class="page">
  <header class="hero">
    <p class="brand">Baby Monitor</p>
    <h1>Viewer</h1>
    <p class="lede">
      Desktop and browser listen tool. Pair with a phone Monitor, then hear the
      room over WebRTC — audio only, peer to peer.
    </p>
    <ConnectionStatus
      phase={statusPhase}
      signalingConnected={signalingConnected}
      detail={sessionMessage}
    />
  </header>

  <main>
    {#if !pairing}
      <PairingPanel
        busy={claimBusy}
        error={claimError}
        onClaimCode={claimWithCode}
        onClaimJson={claimWithJson}
      />
    {:else}
      <ListenSurface
        phase={sessionPhase}
        hasStream={hasStream}
        mutedHint={mutedHint}
        onListen={listen}
        onDisconnect={disconnect}
        onUnpair={unpair}
      />
      <p class="meta">
        Room <code>{pairing.shortCode || pairing.roomId.slice(0, 10)}</code>
        · signaling <code>{signalingBase.replace(/^https?:\/\//, '')}</code>
      </p>
      {#if claimError}
        <p class="error" role="alert">{claimError}</p>
      {/if}
      <AlertList {alerts} onDismiss={dismissAlert} />
    {/if}

    <SettingsPanel
      baseUrl={signalingBase}
      health={healthText}
      {healthBusy}
      open={settingsOpen}
      onToggle={() => (settingsOpen = !settingsOpen)}
      onSave={saveBase}
      onTestHealth={testHealth}
    />
  </main>

  <footer>
    <p>
      Viewer role only · control plane
      <a href={signalingBase} target="_blank" rel="noreferrer">{signalingBase}</a>
    </p>
  </footer>
</div>

<style>
  .page {
    width: min(720px, calc(100% - 2rem));
    margin: 0 auto;
    padding: 2.25rem 0 3.5rem;
    display: grid;
    gap: 2rem;
  }

  .hero {
    display: grid;
    gap: 0.85rem;
    animation: fade-up 520ms ease-out;
  }

  .brand {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(2.4rem, 7vw, 3.6rem);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1.05;
    color: var(--sage);
  }

  .hero h1 {
    margin: 0;
    font-family: var(--font-body);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }

  .lede {
    margin: 0;
    max-width: 36rem;
    font-size: 1.08rem;
    color: var(--ink-soft);
  }

  main {
    animation: fade-up 640ms ease-out 60ms both;
  }

  .meta {
    margin: 1rem 0 0;
    font-size: 0.88rem;
    color: var(--ink-soft);
  }

  .meta code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.84em;
  }

  .error {
    margin: 0.75rem 0 0;
    color: var(--danger);
    font-weight: 550;
  }

  footer {
    border-top: 1px solid var(--line);
    padding-top: 1rem;
  }

  footer p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }

  footer a {
    color: var(--sage);
  }

  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (max-width: 560px) {
    .page {
      padding-top: 1.5rem;
    }
  }
</style>
