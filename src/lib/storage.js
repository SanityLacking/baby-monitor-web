import { DEFAULT_SIGNALING_BASE, STORAGE_KEYS } from './config.js';
import { PairingPayload } from './pairing.js';
import { normalizeBase } from './signaling/urls.js';

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `web-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function loadSignalingBase() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.signalingBase);
    return normalizeBase(v || DEFAULT_SIGNALING_BASE) || DEFAULT_SIGNALING_BASE;
  } catch {
    return DEFAULT_SIGNALING_BASE;
  }
}

/** @param {string} base */
export function saveSignalingBase(base) {
  localStorage.setItem(STORAGE_KEYS.signalingBase, normalizeBase(base));
}

export function loadOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(STORAGE_KEYS.deviceId);
    if (!id) {
      id = randomId();
      localStorage.setItem(STORAGE_KEYS.deviceId, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

/** @returns {PairingPayload | null} */
export function loadPairing() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.pairing);
    if (!raw) return null;
    const payload = PairingPayload.decode(raw);
    return payload.isValid ? payload : null;
  } catch {
    return null;
  }
}

/** @param {PairingPayload} pairing */
export function savePairing(pairing) {
  localStorage.setItem(STORAGE_KEYS.pairing, JSON.stringify(pairing.toJSON()));
}

export function clearPairing() {
  localStorage.removeItem(STORAGE_KEYS.pairing);
}
