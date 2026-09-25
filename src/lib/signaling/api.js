import { normalizeBase, resolveWs, wsUrlFromBase } from './urls.js';

export class SignalingApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {string | null} [code]
   */
  constructor(status, message, code = null) {
    super(message);
    this.name = 'SignalingApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * @typedef {'pending_accept' | 'accepted' | 'rejected' | 'expired' | 'error'} ClaimStatus
 */

/**
 * Outcome of `POST /v1/rooms/claim` and `GET /v1/pairing-requests/:id`.
 * @typedef {{
 *   status: ClaimStatus,
 *   requestId: string | null,
 *   roomId: string | null,
 *   viewerId: string | null,
 *   sessionToken: string | null,
 *   signalingWsUrl: string,
 *   expiresAt: number | null,
 *   error: string | null,
 *   legacyImmediateClaim: boolean,
 * }} ClaimResult
 */

/**
 * HTTP client for baby-monitor-signal REST endpoints (pairing v2).
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
   * Viewer claim by code → **202 pending_accept** (no session until Accept).
   * Legacy servers may still return 200 + sessionToken immediately.
   *
   * @param {{ code: string, deviceId?: string, deviceLabel?: string }} opts
   * @returns {Promise<ClaimResult>}
   */
  async claimRoom(opts) {
    const code = String(opts.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!code) {
      throw new SignalingApiError(0, 'Code required');
    }
    const body = await this.#post('/v1/rooms/claim', {
      code,
      ...(opts.deviceId ? { deviceId: opts.deviceId } : {}),
      ...(opts.deviceLabel ? { deviceLabel: opts.deviceLabel } : {}),
    });
    return this.#parseClaimResult(body);
  }

  /**
   * Poll claim status: `GET /v1/pairing-requests/:requestId`.
   * @param {string} requestId
   * @returns {Promise<ClaimResult>}
   */
  async getPairingRequest(requestId) {
    const body = await this.#get(
      `/v1/pairing-requests/${encodeURIComponent(requestId)}`,
    );
    return this.#parseClaimResult(body);
  }

  /**
   * Poll until Accept / Reject / expire (or AbortSignal).
   *
   * @param {ClaimResult} pending
   * @param {{
   *   pollIntervalMs?: number,
   *   timeoutMs?: number,
   *   signal?: AbortSignal,
   *   onStatus?: (message: string) => void,
   *   onPairingResult?: (handler: (msg: Record<string, unknown>) => void) => () => void,
   * }} [opts]
   * @returns {Promise<ClaimResult>}
   */
  async waitForAccept(pending, opts = {}) {
    const requestId = pending.requestId;
    if (!requestId) {
      return {
        status: 'error',
        requestId: null,
        roomId: pending.roomId,
        viewerId: null,
        sessionToken: null,
        signalingWsUrl: pending.signalingWsUrl,
        expiresAt: null,
        error: 'Pending claim missing requestId',
        legacyImmediateClaim: false,
      };
    }

    const pollIntervalMs = opts.pollIntervalMs ?? 2000;
    let timeoutMs = opts.timeoutMs;
    if (timeoutMs == null) {
      if (pending.expiresAt != null) {
        timeoutMs = Math.max(1000, pending.expiresAt - Date.now());
      } else {
        timeoutMs = 60_000;
      }
    }

    const deadline = Date.now() + timeoutMs;
    opts.onStatus?.('Waiting for the monitor to Accept…');

    /** @type {ClaimResult | null} */
    let wsResult = null;
    const unsub = opts.onPairingResult?.((msg) => {
      if (String(msg.type || '') !== 'pairing_result') return;
      const rid = msg.requestId != null ? String(msg.requestId) : '';
      if (rid && rid !== requestId) return;
      wsResult = this.#parseClaimResult(msg);
    });

    try {
      while (Date.now() < deadline) {
        if (opts.signal?.aborted) {
          throw new SignalingApiError(0, 'Pairing cancelled', 'cancelled');
        }
        if (wsResult && isTerminalClaim(wsResult)) return wsResult;

        try {
          const polled = await this.getPairingRequest(requestId);
          if (isTerminalClaim(polled)) return polled;
        } catch (e) {
          if (e instanceof SignalingApiError) {
            if (e.status === 404 || e.status === 410) {
              return {
                status: 'expired',
                requestId,
                roomId: pending.roomId,
                viewerId: null,
                sessionToken: null,
                signalingWsUrl: pending.signalingWsUrl,
                expiresAt: null,
                error:
                  e.message ||
                  'That request timed out. Enter the code again.',
                legacyImmediateClaim: false,
              };
            }
          }
          /* soft network blips — keep waiting */
        }

        opts.onStatus?.('Waiting for the monitor to Accept…');
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await sleep(Math.min(pollIntervalMs, remaining), opts.signal);
      }

      return {
        status: 'expired',
        requestId,
        roomId: pending.roomId,
        viewerId: null,
        sessionToken: null,
        signalingWsUrl: pending.signalingWsUrl,
        expiresAt: null,
        error: 'That request timed out. Enter the code again.',
        legacyImmediateClaim: false,
      };
    } finally {
      unsub?.();
    }
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

  /**
   * Prefer per-viewer Unpair when viewerId is known.
   * @param {string} roomId
   * @param {string} viewerId
   * @param {string} sessionToken
   */
  async revokeViewer(roomId, viewerId, sessionToken) {
    await this.#post(
      `/v1/rooms/${encodeURIComponent(roomId)}/viewers/${encodeURIComponent(viewerId)}/revoke`,
      { token: sessionToken },
    );
  }

  /**
   * @param {Record<string, unknown>} body
   * @returns {ClaimResult}
   */
  #parseClaimResult(body) {
    const statusRaw = String(body.status || '').toLowerCase();
    const session =
      typeof body.sessionToken === 'string' ? body.sessionToken : null;
    const roomId = typeof body.roomId === 'string' ? body.roomId : null;
    const wsRaw =
      typeof body.signalingWsUrl === 'string' ? body.signalingWsUrl : '';
    const signalingWsUrl = wsRaw
      ? resolveWs({ fromPayload: wsRaw, base: this.baseUrl })
      : wsUrlFromBase(this.baseUrl);

    let expiresAt = null;
    if (typeof body.expiresAt === 'number') {
      expiresAt =
        body.expiresAt > 1e12 ? body.expiresAt : body.expiresAt * 1000;
    } else if (body.expiresAt != null) {
      const parsed = Date.parse(String(body.expiresAt));
      if (!Number.isNaN(parsed)) expiresAt = parsed;
    }

    if (statusRaw === 'pending_accept' || statusRaw === 'pending') {
      return {
        status: 'pending_accept',
        requestId: body.requestId != null ? String(body.requestId) : null,
        roomId,
        viewerId: null,
        sessionToken: null,
        signalingWsUrl,
        expiresAt,
        error: null,
        legacyImmediateClaim: false,
      };
    }

    if (statusRaw === 'rejected') {
      return {
        status: 'rejected',
        requestId: body.requestId != null ? String(body.requestId) : null,
        roomId,
        viewerId: null,
        sessionToken: null,
        signalingWsUrl,
        expiresAt: null,
        error:
          typeof body.error === 'string'
            ? body.error
            : 'The monitor declined this pairing.',
        legacyImmediateClaim: false,
      };
    }

    if (statusRaw === 'expired') {
      return {
        status: 'expired',
        requestId: body.requestId != null ? String(body.requestId) : null,
        roomId,
        viewerId: null,
        sessionToken: null,
        signalingWsUrl,
        expiresAt: null,
        error:
          typeof body.error === 'string'
            ? body.error
            : 'That request timed out. Enter the code again.',
        legacyImmediateClaim: false,
      };
    }

    if (
      statusRaw === 'accepted' ||
      (session && roomId)
    ) {
      return {
        status: 'accepted',
        requestId: body.requestId != null ? String(body.requestId) : null,
        roomId,
        viewerId: body.viewerId != null ? String(body.viewerId) : null,
        sessionToken: session,
        signalingWsUrl,
        expiresAt: null,
        error: null,
        legacyImmediateClaim: statusRaw !== 'accepted',
      };
    }

    return {
      status: 'error',
      requestId: body.requestId != null ? String(body.requestId) : null,
      roomId,
      viewerId: null,
      sessionToken: null,
      signalingWsUrl,
      expiresAt: null,
      error:
        typeof body.error === 'string'
          ? body.error
          : 'Unexpected claim response',
      legacyImmediateClaim: false,
    };
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
      const err =
        typeof body.error === 'string' ? body.error : raw || res.statusText;
      const code = typeof body.code === 'string' ? body.code : null;
      throw new SignalingApiError(res.status, err, code);
    }
    return body;
  }
}

/**
 * @param {ClaimResult} result
 */
export function isTerminalClaim(result) {
  return (
    result.status === 'accepted' ||
    result.status === 'rejected' ||
    result.status === 'expired' ||
    result.status === 'error'
  );
}

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SignalingApiError(0, 'Pairing cancelled', 'cancelled'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new SignalingApiError(0, 'Pairing cancelled', 'cancelled'));
      },
      { once: true },
    );
  });
}
