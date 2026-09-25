/** Default live Render signaling (HTTP base, no trailing slash). */
export const DEFAULT_SIGNALING_BASE =
  'https://baby-monitor-signal.onrender.com';

export const STORAGE_KEYS = Object.freeze({
  signalingBase: 'bm.signalingBaseUrl',
  pairing: 'bm.pairing',
  deviceId: 'bm.deviceId',
});

export const RECONNECT = Object.freeze({
  initialMs: 1000,
  maxMs: 30_000,
});
