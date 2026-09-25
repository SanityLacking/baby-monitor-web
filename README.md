# Baby Monitor — Web Viewer

Browser/desktop **viewer** for [Baby Monitor](https://github.com/SanityLacking/baby-monitor). Pair with a phone running the Flutter **Monitor** role, then listen to live audio over WebRTC.

- **Role:** Viewer only (no mic / monitor mode in v1)
- **Stack:** Vite + Svelte 5 (SPA), native `RTCPeerConnection`
- **Signaling default:** `https://baby-monitor-signal.onrender.com`

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

## Pair with a phone Monitor

1. On the phone, open Baby Monitor → **Monitor** → create / show pairing (QR or copy JSON).
2. In this web viewer, either:
   - **Paste payload** — paste the QR JSON (`roomId`, `token`, `code`, `signaling`), or
   - **Code + token** — short code **and** pairing token (token alone is not enough; short code alone is not enough).
3. Tap **Claim & connect**. The viewer calls `POST /v1/rooms/claim`, stores the session token, opens `/ws`, and waits for the Monitor’s WebRTC offer.
4. When audio arrives, browsers may require a click — use **Tap to unmute** / **Listen**.

Unpair clears local credentials and optionally calls `POST /v1/rooms/:roomId/revoke`.

---

## Endpoints used

| Method | Path | Use |
|--------|------|-----|
| `GET` | `/health` | Connectivity check |
| `GET` | `/v1/ice-servers` | ICE list for `RTCPeerConnection` |
| `POST` | `/v1/rooms/claim` | Claim short code / pairing token |
| `POST` | `/v1/rooms/:id/revoke` | Unpair |
| `WS` | `/ws?roomId&token&role=viewer&deviceId` | Offer/answer/ICE relay + alerts |

### Stubbed / out of scope (v1)

- Monitor role / microphone capture
- Push notifications (FCM/APNs)
- QR camera scanning (paste JSON instead)
- TURN credential minting UI (uses whatever ICE the signaling server returns; public STUN by default)

---

## Create / push GitHub repo

If this clone has no remote yet:

```bash
gh repo create SanityLacking/baby-monitor-web --private --source=. --remote=origin --push
```

Or via the GitHub UI: create `SanityLacking/baby-monitor-web`, then:

```bash
git remote add origin https://github.com/SanityLacking/baby-monitor-web.git
git push -u origin main
```

---

## Related

- Signaling: [SanityLacking/baby-monitor-signal](https://github.com/SanityLacking/baby-monitor-signal)
- Flutter app: [SanityLacking/baby-monitor](https://github.com/SanityLacking/baby-monitor)
- Project docs (agent store): `docs/web-viewer.md`, `docs/control-plane.md`
