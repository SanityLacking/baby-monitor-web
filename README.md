# Baby Monitor — Web Viewer

Browser/desktop **viewer** for [Baby Monitor](https://github.com/SanityLacking/baby-monitor). Pair with a phone running the Flutter **Monitor** role, then listen to live audio over WebRTC.

- **Role:** Viewer only (no mic / monitor mode)
- **Stack:** Vite + Svelte 5 (SPA), native `RTCPeerConnection`
- **Signaling default:** `https://baby-monitor-signal.onrender.com`
- **Pairing:** v2 Accept-gated — claim returns `pending_accept`; no session until the Monitor taps Accept

This repo is separate from the Flutter app (`baby-monitor`) and the control plane (`baby-monitor-signal`).

---

## Quick start

```bash
cd baby-monitor-web
npm install
npm run dev
```

Open **[http://127.0.0.1:4731](http://127.0.0.1:4731)**.

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server on port **4731** |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve `dist/` on port **4731** |

---

## Point at signaling

Default base URL is the live Render service:

```
https://baby-monitor-signal.onrender.com
```

WebSocket: `wss://baby-monitor-signal.onrender.com/ws`

In the app UI, expand **Signaling** to:

- Change the base URL (local `http://127.0.0.1:3847` or any host)
- **Test /health** (useful after Render free-tier cold starts, ~30–60s)
- Reset to the live default

The choice is stored in `localStorage`.

---

## Pair with a phone Monitor (pairing v2)

1. On the phone, open Baby Monitor → **Monitor** → start listening (shows a **5-character** code / QR).
2. In this web viewer, either:
   - **Enter code** — type the 5-char code (+ optional device name), or
   - **Paste QR JSON** — `{ "v": 2, "code": "K7M2Q", "roomId": "…", "signaling": "wss://…/ws" }`
3. Tap **Request pairing**. The viewer calls `POST /v1/rooms/claim` → **202 `pending_accept`**.
4. On the phone Monitor, tap **Accept**. The viewer polls `GET /v1/pairing-requests/:id` (and listens for `pairing_result`) until tokens arrive.
5. Only after Accept does the viewer store `sessionToken` + `viewerId`, open `/ws`, and wait for the Monitor’s WebRTC offer.
6. When audio arrives, browsers may require a click — use **Tap to unmute** / **Listen**.

Reconnect uses stored session credentials — no code, no Accept. Unpair clears local credentials and calls `POST /v1/rooms/:roomId/revoke`. Mid-session Unpair from the Monitor surfaces “This device was unpaired on the monitor.”

---

## Endpoints used

| Method | Path | Use |
|--------|------|-----|
| `GET` | `/health` | Connectivity check |
| `GET` | `/v1/ice-servers` | ICE list for `RTCPeerConnection` |
| `POST` | `/v1/rooms/claim` | Claim by code → **202 pending_accept** |
| `GET` | `/v1/pairing-requests/:id` | Poll until accepted / rejected / expired |
| `POST` | `/v1/rooms/:id/revoke` | Unpair |
| `WS` | `/ws?roomId&token&role=viewer&deviceId&viewerId` | Offer/answer/ICE + alerts + `pairing_result` / `pairing_revoked` |

### Stubbed / out of scope

- Monitor role / microphone capture
- Push notifications (FCM/APNs)
- QR camera scanning (paste JSON instead)
- TURN credential minting UI (uses whatever ICE the signaling server returns; public STUN by default)

---

## Related

- Signaling: [SanityLacking/baby-monitor-signal](https://github.com/SanityLacking/baby-monitor-signal)
- Flutter app: [SanityLacking/baby-monitor](https://github.com/SanityLacking/baby-monitor)
- Project docs: `docs/web-viewer.md`, `docs/pairing.md`, `docs/control-plane.md`
