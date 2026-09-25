import { baseFromWs, resolveWs, wsUrlFromBase } from './signaling/urls.js';

/**
 * Out-of-band pairing payload (QR / paste JSON) + persisted session.
 * Pairing v2 QR: `{ v: 2, code, roomId, signaling }` — no token until Accept.
 */
export class PairingPayload {
  /**
   * @param {{
   *   version?: number,
   *   roomId: string,
   *   signalingWsUrl: string,
   *   pairingToken?: string | null,
   *   sessionToken?: string | null,
   *   viewerId?: string | null,
   *   shortCode?: string | null,
   *   deviceLabel?: string | null,
   *   signalingBaseUrl?: string | null,
   * }} raw
   */
  constructor(raw) {
    this.version = raw.version ?? 2;
    this.roomId = raw.roomId;
    this.pairingToken = raw.pairingToken || null;
    this.sessionToken = raw.sessionToken || null;
    this.viewerId = raw.viewerId || null;
    this.signalingWsUrl = raw.signalingWsUrl;
    this.signalingBaseUrl = raw.signalingBaseUrl || null;
    this.shortCode = raw.shortCode ? String(raw.shortCode).toUpperCase() : null;
    this.deviceLabel = raw.deviceLabel || null;
  }

  /** Token for WebSocket join — session only after Accept (no pairing-token auto-claim). */
  get joinToken() {
    return this.sessionToken;
  }

  /** Ready to open WSS as an already-paired viewer. */
  get isValid() {
    return Boolean(this.roomId && this.signalingWsUrl && this.sessionToken);
  }

  /** Has an invite code suitable for a new Accept-gated claim. */
  get hasInviteCode() {
    return Boolean(this.shortCode);
  }

  toJSON() {
    return {
      v: this.version,
      roomId: this.roomId,
      signaling: this.signalingWsUrl,
      signalingUrl: this.signalingWsUrl,
      ...(this.signalingBaseUrl ? { signalingBaseUrl: this.signalingBaseUrl } : {}),
      ...(this.sessionToken ? { sessionToken: this.sessionToken } : {}),
      ...(this.viewerId ? { viewerId: this.viewerId } : {}),
      ...(this.shortCode ? { code: this.shortCode, shortCode: this.shortCode } : {}),
      ...(this.deviceLabel ? { deviceLabel: this.deviceLabel } : {}),
      // Legacy field — never required for v2 claim; kept only if somehow present.
      ...(this.pairingToken
        ? { token: this.pairingToken, pairingToken: this.pairingToken }
        : {}),
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
    const viewerId = json.viewerId;
    const deviceLabel = json.deviceLabel;

    return new PairingPayload({
      version: typeof json.v === 'number' ? json.v : 2,
      roomId: String(json.roomId ?? ''),
      pairingToken: pairing ? String(pairing) : null,
      sessionToken: session ? String(session) : null,
      viewerId: viewerId ? String(viewerId) : null,
      signalingWsUrl: ws,
      signalingBaseUrl:
        baseRaw || (ws ? baseFromWs(ws) : fallbackBase || null),
      shortCode: code ? String(code).toUpperCase() : null,
      deviceLabel: deviceLabel ? String(deviceLabel) : null,
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
      version: patch.version !== undefined ? patch.version : this.version,
      roomId: patch.roomId ?? this.roomId,
      pairingToken:
        patch.pairingToken !== undefined ? patch.pairingToken : this.pairingToken,
      sessionToken:
        patch.sessionToken !== undefined ? patch.sessionToken : this.sessionToken,
      viewerId: patch.viewerId !== undefined ? patch.viewerId : this.viewerId,
      signalingWsUrl: patch.signalingWsUrl ?? this.signalingWsUrl,
      signalingBaseUrl:
        patch.signalingBaseUrl !== undefined
          ? patch.signalingBaseUrl
          : this.signalingBaseUrl,
      shortCode: patch.shortCode !== undefined ? patch.shortCode : this.shortCode,
      deviceLabel:
        patch.deviceLabel !== undefined ? patch.deviceLabel : this.deviceLabel,
    });
  }
}
