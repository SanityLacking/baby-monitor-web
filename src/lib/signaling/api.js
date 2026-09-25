import { normalizeBase, resolveWs, wsUrlFromBase } from './urls.js';

export class SignalingApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = 'SignalingApiError';
    this.status = status;
  }
}

/**
 * HTTP client for baby-monitor-signal REST endpoints.
 */
export class SignalingApi {
  /** @param {string} baseUrl */
  constructor(baseUrl) {
    this.baseUrl = normalizeBase(baseUrl);
  }

  setBaseUrl(baseUrl) {
    this.baseUrl = normalizeBase(baseUrl);
  }

  async getHealth() {
    return this.#get('/health');
  }

  /** @returns {Promise<RTCIceServer[]>} */
  async getIceServers() {
    const body = await this.#get('/v1/ice-servers');
    const list = body.iceServers;
    if (!Array.isArray(list)) return [];
    return list.filter((e) => e && typeof e === 'object');
  }

  /**
   * Viewer claims with pairing token (+ roomId or short code).
   * @param {{ pairingToken: string, roomId?: string, code?: string, deviceId?: string }} opts
   */
  async claimRoom(opts) {
    const body = await this.#post('/v1/rooms/claim', {
      pairingToken: opts.pairingToken,
      ...(opts.roomId ? { roomId: opts.roomId } : {}),
      ...(opts.code ? { code: String(opts.code).toUpperCase() } : {}),
      ...(opts.deviceId ? { deviceId: opts.deviceId } : {}),
    });
    const ws = body.signalingWsUrl ? String(body.signalingWsUrl) : '';
    return {
      roomId: String(body.roomId || ''),
      sessionToken: String(body.sessionToken || ''),
      signalingWsUrl: ws
        ? resolveWs({ fromPayload: ws, base: this.baseUrl })
        : wsUrlFromBase(this.baseUrl),
    };
  }

  /**
   * @param {string} roomId
   * @param {{ token: string, role?: string }} opts
   */
  async revokeRoom(roomId, opts) {
    await this.#post(`/v1/rooms/${encodeURIComponent(roomId)}/revoke`, {
      token: opts.token,
      role: opts.role || 'viewer',
    });
  }

  async #get(path) {
    return this.#request(path, { method: 'GET' });
  }

  /**
   * @param {string} path
   * @param {Record<string, unknown>} json
   */
  async #post(path, json) {
    return this.#request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(json),
    });
  }

  /**
   * @param {string} path
   * @param {RequestInit} init
   */
  async #request(path, init) {
    if (!this.baseUrl) {
      throw new SignalingApiError(0, 'Signaling base URL is empty');
    }
    const url = `${this.baseUrl}${path}`;
    let res;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          accept: 'application/json',
          ...(init.headers || {}),
        },
      });
    } catch (e) {
      throw new SignalingApiError(
        0,
        `Can’t reach signaling server at ${this.baseUrl} (${e instanceof Error ? e.message : e})`,
      );
    }

    const raw = await res.text();
    /** @type {Record<string, unknown>} */
    let body = {};
    if (raw) {
      try {
        const decoded = JSON.parse(raw);
        if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
          body = decoded;
        }
      } catch {
        /* non-JSON body */
      }
    }

    if (!res.ok) {
      const err = typeof body.error === 'string' ? body.error : raw || res.statusText;
      throw new SignalingApiError(res.status, err);
    }
    return body;
  }
}
