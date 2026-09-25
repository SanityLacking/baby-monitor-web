/**
 * Viewer-only WebRTC audio session using native RTCPeerConnection.
 * Monitor creates the offer; this peer answers and plays remote audio.
 *
 * @typedef {'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'} SessionPhase
 */
export class WebrtcViewerSession {
  /**
   * @param {{
   *   signaling: import('../signaling/client.js').SignalingClient,
   *   api: import('../signaling/api.js').SignalingApi,
   *   onState?: () => void,
   *   onAlert?: (alert: { kind: string, level?: number, message: string, at?: string }) => void,
   * }} deps
   */
  constructor(deps) {
    this._signaling = deps.signaling;
    this._api = deps.api;
    this._onState = deps.onState || (() => {});
    this._onAlert = deps.onAlert || (() => {});

    /** @type {RTCPeerConnection | null} */
    this._pc = null;
    /** @type {MediaStream | null} */
    this.remoteStream = null;
    /** @type {(() => void) | null} */
    this._unsub = null;
    /** @type {RTCIceCandidateInit[]} */
    this._pendingRemoteIce = [];

    /** @type {SessionPhase} */
    this.phase = 'idle';
    /** @type {string | null} */
    this.message = null;
  }

  #setState(phase, message = null) {
    this.phase = phase;
    this.message = message;
    this._onState();
  }

  /**
   * @param {{
   *   roomId: string,
   *   token: string,
   *   deviceId: string,
   *   viewerId?: string,
   *   signalingWsUrl: string,
   *   signalingBaseUrl: string,
   *   audioEl?: HTMLAudioElement | null,
   * }} opts
   */
  async start(opts) {
    this._audioEl = opts.audioEl || null;

    try {
      const ice = await this.#resolveIceServers();
      await this.#preparePeer(ice);

      const ok = await this._signaling.connect({
        role: 'viewer',
        roomId: opts.roomId,
        token: opts.token,
        deviceId: opts.deviceId,
        viewerId: opts.viewerId,
        signalingWsUrl: opts.signalingWsUrl,
        signalingBaseUrl: opts.signalingBaseUrl,
      });

      if (!ok) {
        this.#setState('error', this._signaling.lastError || 'Signaling connect failed');
        return false;
      }

      this.#setState('connecting', 'Joined signaling — waiting for monitor offer');
      return true;
    } catch (e) {
      this.#setState(
        'error',
        `Viewer start failed: ${e instanceof Error ? e.message : e}`,
      );
      return false;
    }
  }

  async #resolveIceServers() {
    try {
      const remote = await this._api.getIceServers();
      if (remote.length) return remote;
    } catch (e) {
      console.warn('GET /v1/ice-servers failed', e);
    }
    if (this._signaling.welcomeIceServers?.length) {
      return this._signaling.welcomeIceServers;
    }
    return [{ urls: ['stun:stun.l.google.com:19302'] }];
  }

  /**
   * @param {RTCIceServer[]} iceServers
   */
  async #preparePeer(iceServers) {
    await this.stop({ disconnectSignaling: false });

    this._pc = new RTCPeerConnection({
      iceServers,
      // @ts-expect-error unified-plan is default in modern browsers
      sdpSemantics: 'unified-plan',
    });

    // Viewer receives audio only — ensure transceiver exists for offer answer.
    this._pc.addTransceiver('audio', { direction: 'recvonly' });

    this._pc.onicecandidate = (ev) => {
      const c = ev.candidate;
      if (!c) return;
      void this._signaling
        .sendIce({
          candidate: c.candidate,
          sdpMid: c.sdpMid,
          sdpMLineIndex: c.sdpMLineIndex,
        })
        .catch(() => {});
    };

    this._pc.onconnectionstatechange = () => {
      const s = this._pc?.connectionState;
      if (s === 'connected') {
        this.#setState('connected', null);
      } else if (s === 'failed') {
        this.#setState(
          'error',
          'WebRTC connection failed — check STUN/TURN on the signaling server',
        );
      } else if (s === 'disconnected') {
        this.#setState('reconnecting', 'Peer disconnected — reconnecting…');
      }
    };

    this._pc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      this.remoteStream = stream;
      for (const track of stream.getAudioTracks()) {
        track.enabled = true;
      }
      if (this._audioEl) {
        this._audioEl.srcObject = stream;
        void this._audioEl.play().catch((err) => {
          console.warn('Audio play blocked until user gesture', err);
          this.message =
            'Tap Listen to unmute — browsers require a click before audio plays';
          this._onState();
        });
      }
      this._onState();
    };

    this._unsub?.();
    this._unsub = this._signaling.onMessage((msg) => {
      void this.#handleSignaling(msg);
    });
  }

  /**
   * @param {Record<string, unknown>} msg
   */
  async #handleSignaling(msg) {
    const type = msg.type;
    const pc = this._pc;
    if (!pc || typeof type !== 'string') return;

    try {
      switch (type) {
        case 'welcome': {
          const peers = msg.peers;
          if (Array.isArray(peers)) {
            const hasMonitor = peers.some(
              (p) => p && typeof p === 'object' && /** @type {{role?: string}} */ (p).role === 'monitor',
            );
            if (hasMonitor) {
              this.#setState('connecting', 'Monitor online — waiting for offer');
            }
          }
          break;
        }
        case 'peer': {
          const event = String(msg.event || '');
          const peerRole = String(msg.role || '');
          if (event === 'joined' && peerRole === 'monitor') {
            this.#setState('connecting', 'Monitor joined — waiting for offer');
          }
          if (event === 'left') {
            this.#setState('reconnecting', 'Peer left — waiting to reconnect');
          }
          break;
        }
        case 'offer': {
          const sdp = typeof msg.sdp === 'string' ? msg.sdp : '';
          if (!sdp) return;
          await pc.setRemoteDescription({ type: 'offer', sdp });
          await this.#flushPendingIce(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (answer.sdp) await this._signaling.sendAnswer(answer.sdp);
          this.#setState('connecting', 'Answer sent — negotiating ICE');
          break;
        }
        case 'ice': {
          await this.#addIce(pc, msg);
          break;
        }
        case 'alert': {
          this._onAlert({
            kind: String(msg.kind || 'sound'),
            level: typeof msg.level === 'number' ? msg.level : undefined,
            message: String(msg.message || 'Disturbance detected'),
            at: typeof msg.at === 'string' ? msg.at : undefined,
          });
          break;
        }
        case 'session': {
          if (msg.action === 'unpair') {
            this.#setState('error', 'Pairing revoked by peer');
          }
          break;
        }
        case 'error': {
          this.#setState('error', String(msg.message || 'Signaling error'));
          break;
        }
        default:
          break;
      }
    } catch (e) {
      console.warn('Signaling handle error', e);
    }
  }

  /**
   * @param {RTCPeerConnection} pc
   * @param {Record<string, unknown>} msg
   */
  async #addIce(pc, msg) {
    const candidate = msg.candidate;
    let candStr = null;
    let sdpMid = typeof msg.sdpMid === 'string' ? msg.sdpMid : undefined;
    let sdpMLineIndex =
      typeof msg.sdpMLineIndex === 'number' ? msg.sdpMLineIndex : undefined;

    if (typeof candidate === 'string') {
      candStr = candidate;
    } else if (candidate && typeof candidate === 'object') {
      const c = /** @type {Record<string, unknown>} */ (candidate);
      candStr = typeof c.candidate === 'string' ? c.candidate : null;
      if (typeof c.sdpMid === 'string') sdpMid = c.sdpMid;
      if (typeof c.sdpMLineIndex === 'number') sdpMLineIndex = c.sdpMLineIndex;
    } else if (candidate == null) {
      return;
    }

    if (!candStr) return;
    /** @type {RTCIceCandidateInit} */
    const ice = { candidate: candStr, sdpMid, sdpMLineIndex };
    if (!pc.remoteDescription) {
      this._pendingRemoteIce.push(ice);
    } else {
      await pc.addIceCandidate(ice);
    }
  }

  /** @param {RTCPeerConnection} pc */
  async #flushPendingIce(pc) {
    const pending = [...this._pendingRemoteIce];
    this._pendingRemoteIce = [];
    for (const c of pending) {
      try {
        await pc.addIceCandidate(c);
      } catch (e) {
        console.warn('Pending ICE add failed', e);
      }
    }
  }

  /** Resume playback after a user gesture (autoplay policy). */
  async resumeAudio() {
    const el = this._audioEl;
    if (!el) return false;
    try {
      await el.play();
      if (this.phase === 'connected') this.message = null;
      this._onState();
      return true;
    } catch (e) {
      this.message = `Couldn’t start audio: ${e instanceof Error ? e.message : e}`;
      this._onState();
      return false;
    }
  }

  /**
   * @param {{ disconnectSignaling?: boolean }} [opts]
   */
  async stop(opts = {}) {
    const disconnectSignaling = opts.disconnectSignaling !== false;
    this._unsub?.();
    this._unsub = null;
    if (disconnectSignaling) {
      await this._signaling.disconnect({ permanent: true });
    }

    if (this._audioEl) {
      this._audioEl.srcObject = null;
    }
    this.remoteStream = null;

    if (this._pc) {
      try {
        this._pc.close();
      } catch {
        /* ignore */
      }
      this._pc = null;
    }
    this._pendingRemoteIce = [];
    this.#setState('idle', null);
  }
}
