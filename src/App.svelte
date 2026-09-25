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
  import { normalizeBase, baseFromWs, wsUrlFromBase } from './lib/signaling/urls.js';
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
  let claimWaiting = $state(false);
  let claimStatus = $state(/** @type {string | null} */ (null));
  let claimError = $state(/** @type {string | null} */ (null));
  /** @type {AbortController | null} */
  let claimAbort = $state(null);

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
    const offStatus = signaling.onStatus(() => {
      signalingConnected = signaling.connected;
      if (signaling.lastError && session.phase !== 'connected') {
        sessionMessage = signaling.lastError;
      }
    });

    const offMsg = signaling.onMessage((msg) => {
      if (String(msg.type || '') === 'pairing_revoked') {
        void handleRevoked();
      }
    });

    if (pairing?.isValid) {
      void startSession(pairing);
    }

    return () => {
      offStatus();
      offMsg();
      claimAbort?.abort();
      void session.stop();
    };
  });

  async function handleRevoked() {
    await session.stop();
    clearPairing();
    pairing = null;
    alerts = [];
    claimError = 'This device was unpaired on the monitor.';
  }

  /**
   * @param {PairingPayload} next
   */
  async function startSession(next) {
    api.setBaseUrl(signalingBase);
    const ok = await session.start({
      roomId: next.roomId,
      token: /** @type {string} */ (next.joinToken),
      deviceId,
      viewerId: next.viewerId || undefined,
      signalingWsUrl: next.signalingWsUrl,
      signalingBaseUrl: signalingBase,
      audioEl,
    });
    if (!ok) claimError = session.message;
  }

  /**
   * Run Accept-gated claim: POST claim → poll until accepted → persist + connect.
   * @param {string} code
   * @param {string} [deviceLabel]
   */
  async function runAcceptGatedClaim(code, deviceLabel = '') {
    claimError = null;
    claimStatus = null;
    const normalized = code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!normalized) {
      claimError = 'Enter the 5-character code from the monitor.';
      return;
    }

    claimAbort?.abort();
    const ac = new AbortController();
    claimAbort = ac;

    claimBusy = true;
    claimWaiting = false;
    try {
      api.setBaseUrl(signalingBase);
      claimStatus = 'Sending pairing request…';
      let result = await api.claimRoom({
        code: normalized,
        deviceId,
        deviceLabel: deviceLabel || undefined,
      });

      if (result.legacyImmediateClaim) {
        claimStatus =
          'Paired (legacy server issued tokens immediately — no Accept gate).';
      }

      if (result.status === 'pending_accept') {
        claimWaiting = true;
        result = await api.waitForAccept(result, {
          signal: ac.signal,
          onStatus: (msg) => {
            claimStatus = msg;
          },
          onPairingResult: (handler) => signaling.onMessage(handler),
        });
      }

      if (result.status === 'rejected') {
        throw new SignalingApiError(
          403,
          result.error || 'The monitor declined this pairing.',
          'rejected',
        );
      }
      if (result.status === 'expired') {
        throw new SignalingApiError(
          408,
          result.error || 'That request timed out. Enter the code again.',
          'expired',
        );
      }
      if (
        result.status !== 'accepted' ||
        !result.sessionToken ||
        !result.roomId
      ) {
        throw new SignalingApiError(
          0,
          result.error || 'Pairing did not complete',
        );
      }

      const next = new PairingPayload({
        version: 2,
        roomId: result.roomId,
        sessionToken: result.sessionToken,
        viewerId: result.viewerId,
        signalingWsUrl: result.signalingWsUrl || wsUrlFromBase(signalingBase),
        signalingBaseUrl: signalingBase,
        shortCode: normalized,
        deviceLabel: deviceLabel || null,
      });
      savePairing(next);
      pairing = next;
      claimWaiting = false;
      claimStatus = null;
      await startSession(next);
    } catch (e) {
      if (
        e instanceof SignalingApiError &&
        (e.code === 'cancelled' || /cancelled/i.test(e.message))
      ) {
        claimError = null;
        claimStatus = null;
      } else {
        claimError =
          e instanceof SignalingApiError
            ? e.message
            : `Claim failed: ${e instanceof Error ? e.message : e}`;
      }
    } finally {
      claimBusy = false;
      claimWaiting = false;
      if (claimAbort === ac) claimAbort = null;
    }
  }

  /**
   * @param {string} code
   * @param {string} deviceLabel
   */
  async function claimWithCode(code, deviceLabel) {
    await runAcceptGatedClaim(code, deviceLabel);
  }

  /**
   * @param {string} raw
   * @param {string} deviceLabel
   */
  async function claimWithJson(raw, deviceLabel) {
    claimError = null;
    try {
      const payload = PairingPayload.decode(raw);

      // Already-paired session paste (reconnect credentials)
      if (payload.isValid) {
        if (payload.signalingBaseUrl) {
          const base = normalizeBase(payload.signalingBaseUrl);
          if (base) {
            signalingBase = base;
            saveSignalingBase(base);
            api.setBaseUrl(base);
          }
        } else if (payload.signalingWsUrl) {
          const base = baseFromWs(payload.signalingWsUrl);
          if (base) {
            signalingBase = base;
            saveSignalingBase(base);
            api.setBaseUrl(base);
          }
        }
        savePairing(payload);
        pairing = payload;
        await startSession(payload);
        return;
      }

      if (payload.signalingWsUrl || payload.signalingBaseUrl) {
        const base =
          normalizeBase(payload.signalingBaseUrl || '') ||
          baseFromWs(payload.signalingWsUrl);
        if (base) {
          signalingBase = base;
          saveSignalingBase(base);
          api.setBaseUrl(base);
        }
      }

      if (!payload.shortCode) {
        throw new Error(
          'Payload needs a code (v2 QR) or a stored sessionToken to reconnect',
        );
      }

      await runAcceptGatedClaim(
        payload.shortCode,
        deviceLabel || payload.deviceLabel || '',
      );
    } catch (e) {
      claimError =
        e instanceof SignalingApiError
          ? e.message
          : `Could not pair: ${e instanceof Error ? e.message : e}`;
    }
  }

  function cancelClaim() {
    claimAbort?.abort();
    claimAbort = null;
    claimBusy = false;
    claimWaiting = false;
    claimStatus = null;
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
    if (pairing?.sessionToken && pairing.roomId) {
      try {
        api.setBaseUrl(signalingBase);
        // Viewer session can tear down the room (same as Flutter revokeLocalAndRemote).
        await api.revokeRoom(pairing.roomId, {
          token: pairing.sessionToken,
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
        waiting={claimWaiting}
        statusMessage={claimStatus}
        error={claimError}
        onClaimCode={claimWithCode}
        onClaimJson={claimWithJson}
        onCancel={cancelClaim}
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
