import { RECONNECT } from '../config.js';
import { wsUrlFromBase } from './urls.js';

/**
 * WebSocket signaling client for baby-monitor-signal (`/ws`).
 * Auth via query: roomId, token, role, deviceId.
 * Relays arrive as `{ type: 'relay', relayType, sdp?, candidate? }`.
 */
export class SignalingClient {
  constructor() {
    /** @type {WebSocket | null} */
    this._socket = null;
    this._wantConnected = false;
    this._manualDisconnect = false;
    this._reconnectAttempt = 0;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._reconnectTimer = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    this._pingTimer = null;

    /** @type {string | null} */
    this._role = null;
    /** @type {string | null} */
    this._roomId = null;
    /** @type {string | null} */
    this._token = null;
    /** @type {string | null} */
    this._deviceId = null;
    /** @type {string} */
    this._wsBase = '';

    this.connected = false;
    /** @type {string | null} */
    this.lastError = null;
    /** @type {RTCIceServer[] | null} */
    this.welcomeIceServers = null;

    /** @type {Set<(msg: Record<string, unknown>) => void>} */
    this._listeners = new Set();
    /** @type {Set<() => void>} */
    this._statusListeners = new Set();
  }

  /** @param {(msg: Record<string, unknown>) => void} fn */
  onMessage(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** @param {() => void} fn */
  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }

  #emitStatus() {
    for (const fn of this._statusListeners) fn();
  }

  /**
   * @param {Record<string, unknown>} msg
   */
  #emit(msg) {
    for (const fn of this._listeners) fn(msg);
  }

  get wsUrl() {
    return this._wsBase || '';
  }

  /**
   * @param {{
   *   role: 'viewer' | 'monitor',
   *   roomId: string,
   *   token: string,
   *   deviceId: string,
   *   signalingWsUrl?: string,
   *   signalingBaseUrl?: string,
   *   autoReconnect?: boolean,
   * }} opts
   */
  async connect(opts) {
    this._wantConnected = opts.autoReconnect !== false;
    this._manualDisconnect = false;
    this._role = opts.role;
    this._roomId = opts.roomId;
    this._token = opts.token;
    this._deviceId = opts.deviceId;
    this._wsBase =
      opts.signalingWsUrl ||
      (opts.signalingBaseUrl ? wsUrlFromBase(opts.signalingBaseUrl) : '');

    if (!this._token) {
      this.lastError = 'Missing session/pairing token — pair again.';
      this.connected = false;
      this.#emitStatus();
      return false;
    }
    if (!this._wsBase) {
      this.lastError = 'Missing signaling WebSocket URL.';
      this.connected = false;
      this.#emitStatus();
      return false;
    }

    return this.#openSocket();
  }

  async #openSocket() {
    this.#tearDownSocket({ notify: false });
    this.lastError = null;
    this.#emitStatus();

    const uri = new URL(this._wsBase);
    uri.searchParams.set('roomId', this._roomId);
    uri.searchParams.set('token', this._token);
    uri.searchParams.set('role', this._role);
    uri.searchParams.set('deviceId', this._deviceId);

    return new Promise((resolve) => {
      let settled = false;
      /** @type {WebSocket} */
      let socket;
      try {
        socket = new WebSocket(uri.toString());
      } catch (e) {
        this.lastError = `Can’t open WebSocket (${e instanceof Error ? e.message : e})`;
        this.connected = false;
        this.#emitStatus();
        this.#scheduleReconnect();
        resolve(false);
        return;
      }

      this._socket = socket;

      const fail = (reason) => {
        if (settled) return;
        settled = true;
        this.lastError = reason;
        this.connected = false;
        this.#emitStatus();
        this.#scheduleReconnect();
        resolve(false);
      };

      socket.onopen = () => {
        settled = true;
        this.connected = true;
        this._reconnectAttempt = 0;
        this.lastError = null;
        this.#emitStatus();
        this.#startPing();
        resolve(true);
      };

      socket.onmessage = (ev) => {
        try {
          const map = JSON.parse(String(ev.data));
          if (map && typeof map === 'object') this.#handleInbound(map);
        } catch (e) {
          console.warn('Signaling parse error', e);
        }
      };

      socket.onerror = () => {
        fail(
          `Can’t reach signaling server at ${uri.origin}${uri.pathname}. Check the signaling base URL or wait for a cold start.`,
        );
      };

      socket.onclose = () => {
        this.connected = false;
        this.#emitStatus();
        if (!settled) {
          fail('WebSocket closed before open');
        } else {
          this.#scheduleReconnect();
        }
      };
    });
  }

  /**
   * @param {Record<string, unknown>} map
   */
  #handleInbound(map) {
    const type = map.type;
    if (type === 'welcome') {
      const ice = map.iceServers;
      if (Array.isArray(ice)) {
        this.welcomeIceServers = ice.filter((e) => e && typeof e === 'object');
      }
    }
    if (type === 'error') {
      this.lastError = String(map.message || 'Signaling error');
      this.#emitStatus();
    }
    if (type === 'relay') {
      const relayType = map.relayType != null ? String(map.relayType) : 'relay';
      this.#emit({
        ...map,
        type: relayType,
        isRelay: true,
      });
      return;
    }
    this.#emit(map);
  }

  #scheduleReconnect() {
    this.#stopPing();
    if (!this._wantConnected || this._manualDisconnect) return;
    if (!this._role || !this._roomId || !this._token) return;

    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    const exp = Math.min(this._reconnectAttempt, 5);
    const delayMs = Math.min(
      RECONNECT.initialMs * 2 ** exp,
      RECONNECT.maxMs,
    );
    const jitter = Math.round(delayMs * 0.2 * Math.random());
    const delay = delayMs + jitter;
    this._reconnectAttempt += 1;
    this.lastError = `Reconnecting in ${Math.round(delay / 1000)}s…`;
    this.#emitStatus();
    this._reconnectTimer = setTimeout(() => {
      void this.#openSocket();
    }, delay);
  }

  #startPing() {
    this.#stopPing();
    this._pingTimer = setInterval(() => {
      void this.send({ type: 'ping', t: Date.now() });
    }, 25_000);
  }

  #stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  /**
   * @param {Record<string, unknown>} message
   */
  async send(message) {
    const socket = this._socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling not connected');
    }
    socket.send(JSON.stringify({ v: 1, ...message }));
  }

  /** @param {string} sdp */
  sendOffer(sdp) {
    return this.send({ type: 'offer', sdp });
  }

  /** @param {string} sdp */
  sendAnswer(sdp) {
    return this.send({ type: 'answer', sdp });
  }

  /**
   * @param {{ candidate: string | null, sdpMid?: string | null, sdpMLineIndex?: number | null }} ice
   */
  sendIce(ice) {
    return this.send({
      type: 'ice',
      candidate: ice.candidate,
      ...(ice.sdpMid != null ? { sdpMid: ice.sdpMid } : {}),
      ...(ice.sdpMLineIndex != null ? { sdpMLineIndex: ice.sdpMLineIndex } : {}),
    });
  }

  /**
   * @param {string} action
   * @param {string} [reason]
   */
  sendSession(action, reason) {
    return this.send({
      type: 'session',
      action,
      ...(reason ? { reason } : {}),
    });
  }

  /**
   * @param {{ permanent?: boolean }} [opts]
   */
  async disconnect(opts = {}) {
    const permanent = opts.permanent !== false;
    this._manualDisconnect = permanent;
    this._wantConnected = !permanent;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.#tearDownSocket({ notify: true });
  }

  /**
   * @param {{ notify: boolean }} opts
   */
  #tearDownSocket(opts) {
    this.#stopPing();
    const socket = this._socket;
    this._socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
    this.connected = false;
    if (opts.notify) this.#emitStatus();
  }
}
