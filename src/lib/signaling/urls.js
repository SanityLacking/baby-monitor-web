/** Normalize signaling HTTP base vs WebSocket `/ws` URLs (matches Flutter). */

export function normalizeBase(input) {
  let s = String(input || '').trim();
  if (!s) return s;
  if (s.startsWith('ws://')) s = `http://${s.slice(5)}`;
  else if (s.startsWith('wss://')) s = `https://${s.slice(6)}`;
  while (s.endsWith('/')) s = s.slice(0, -1);
  if (s.endsWith('/ws')) {
    s = s.slice(0, -3);
    while (s.endsWith('/')) s = s.slice(0, -1);
  }
  return s;
}

export function wsUrlFromBase(base) {
  const b = normalizeBase(base);
  if (!b) return b;
  if (b.startsWith('https://')) return `wss://${b.slice(8)}/ws`;
  if (b.startsWith('http://')) return `ws://${b.slice(7)}/ws`;
  return `ws://${b}/ws`;
}

export function baseFromWs(ws) {
  let s = String(ws || '').trim();
  if (s.startsWith('wss://')) s = `https://${s.slice(6)}`;
  else if (s.startsWith('ws://')) s = `http://${s.slice(5)}`;
  return normalizeBase(s);
}

export function resolveWs({ fromPayload, base }) {
  const p = String(fromPayload || '').trim();
  if (p.startsWith('ws://') || p.startsWith('wss://')) return p;
  if (p.startsWith('http://') || p.startsWith('https://')) return wsUrlFromBase(p);
  return wsUrlFromBase(base);
}
