import { baseFromWs, resolveWs, wsUrlFromBase } from './signaling/urls.js';

/**
 * Out-of-band pairing payload (QR / paste JSON).
 * Matches control-plane `qrPayload` + persisted session credentials.
 */
export class PairingPayload {
  /**
   * @param {{
   *   version?: number,
   *   roomId: string,
   *   signalingWsUrl: string,
   *   pairingToken?: string | null,
   *   sessionToken?: string | null,
   *   shortCode?: string | null,
   *   signalingBaseUrl?: string | null,
   * }} raw
   */
  constructor(raw) {
    this.version = raw.version ?? 1;
    this.roomId = raw.roomId;
    this.pairingToken = raw.pairingToken || null;
    this.sessionToken = raw.sessionToken || null;
    this.signalingWsUrl = raw.signalingWsUrl;
    this.signalingBaseUrl = raw.signalingBaseUrl || null;
    this.shortCode = raw.shortCode ? String(raw.shortCode).toUpperCase() : null;
  }

  /** Token for WebSocket join (prefer session). */
  get joinToken() {
    if (this.sessionToken) return this.sessionToken;
    return this.pairingToken;
  }

  get isValid() {
    return Boolean(
      this.roomId &&
        this.signalingWsUrl &&
        this.joinToken,
    );
  }

  toJSON() {
    return {
      v: this.version,
      roomId: this.roomId,
      signaling: this.signalingWsUrl,
      signalingUrl: this.signalingWsUrl,
      ...(this.signalingBaseUrl ? { signalingBaseUrl: this.signalingBaseUrl } : {}),
      ...(this.pairingToken
        ? { token: this.pairingToken, pairingToken: this.pairingToken }
        : {}),
      ...(this.sessionToken ? { sessionToken: this.sessionToken } : {}),
      ...(this.shortCode ? { code: this.shortCode, shortCode: this.shortCode } : {}),
    };
  }

  /**
   * @param {Record<string, unknown>} json
   * @param {string} [fallbackBase]
   */
  static fromJSON(json, fallbackBase = '') {
    const signalingRaw = String(
      json.signaling ?? json.signalingUrl ?? json.signalingWsUrl ?? '',
    );
    const baseRaw =
      typeof json.signalingBaseUrl === 'string'
        ? json.signalingBaseUrl.trim()
        : '';
    const ws = signalingRaw
      ? resolveWs({
          fromPayload: signalingRaw,
          base: baseRaw || baseFromWs(signalingRaw) || fallbackBase,
        })
      : baseRaw
        ? wsUrlFromBase(baseRaw)
        : fallbackBase
          ? wsUrlFromBase(fallbackBase)
          : '';

    const pairing = json.token ?? json.pairingToken;
    const session = json.sessionToken;
    const code = json.code ?? json.shortCode;

    return new PairingPayload({
      version: typeof json.v === 'number' ? json.v : 1,
      roomId: String(json.roomId ?? ''),
      pairingToken: pairing ? String(pairing) : null,
      sessionToken: session ? String(session) : null,
      signalingWsUrl: ws,
      signalingBaseUrl:
        baseRaw || (ws ? baseFromWs(ws) : fallbackBase || null),
      shortCode: code ? String(code).toUpperCase() : null,
    });
  }

  /** @param {string} raw */
  static decode(raw) {
    const map = JSON.parse(raw);
    if (!map || typeof map !== 'object') {
      throw new Error('Pairing payload must be a JSON object');
    }
    return PairingPayload.fromJSON(/** @type {Record<string, unknown>} */ (map));
  }

  /**
   * @param {Partial<PairingPayload>} patch
   */
  with(patch) {
    return new PairingPayload({
      version: this.version,
      roomId: this.roomId,
      pairingToken: patch.pairingToken !== undefined ? patch.pairingToken : this.pairingToken,
      sessionToken: patch.sessionToken !== undefined ? patch.sessionToken : this.sessionToken,
      signalingWsUrl: patch.signalingWsUrl ?? this.signalingWsUrl,
      signalingBaseUrl:
        patch.signalingBaseUrl !== undefined
          ? patch.signalingBaseUrl
          : this.signalingBaseUrl,
      shortCode: patch.shortCode !== undefined ? patch.shortCode : this.shortCode,
    });
  }
}
