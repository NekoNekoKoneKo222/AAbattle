# SPRA — INK BATTLE / Standalone 2D Game

This is the complete SPRA 2D ink-battle game only, extracted from AAbattle. There are **no other games**, user account servers, or unrelated APIs in this folder. The original pixel-art visual style, city, weapons, special effects, tutorial and online PvP remain intact.

## Requirements
- Windows 10/11, Node.js 20+, npm, Tailscale (logged in)
- Tailscale Funnel enabled on your tailnet (internet-accessible HTTPS)
- A unique password of 12–128 characters, shared privately with your friends

## Quick start for Windows
1. Extract the ZIP in a writable folder (do not run from inside the ZIP).
2. Run **START_SPRA_FUNNEL.bat**.
3. Enter a secure password; the script starts the SPRA-only server on `127.0.0.1:3187` and checks CSS, JS, HTML, and local font delivery.
4. Once Funnel is active, share the HTTPS device link ending in **/spra/** with friends. Share the password separately.
5. Stop via Enter in the launcher window. If the window closes unexpectedly, use **STOP_SPRA_FUNNEL.bat**.

## Local server without Tailscale
Run `npm ci --omit=dev`, set `SPRA_FRIEND_PASSWORD` to a private 12–128 character password in your local process environment, then run `npm start`. Open `http://127.0.0.1:3187/spra/` in your browser.

## Security and data notes
- The HTTP server only binds 127.0.0.1. Funnel publishes it via HTTPS.
- All SPRA CSS/JS/font assets, leaderboard and WebSocket require the friend password session.
- Other AAbattle games and API routes are not included or accessible.
- Login input and WebSocket messages are size-limited, with origin checks, bounded sessions, and rate/connection limits. Passwords never belong in the URL.
- Tailscale Funnel is publicly accessible: the friend password is an additional gate, not a guarantee against all attacks.
- Existing XP, coins, owned weapons, and furniture are saved to browser localStorage and are client-editable. This edition is suitable for limited friend playtests, **not** a protected ranked economy.
- Standalone leaderboard is in server memory; it resets after server restart.
- Real existing pixel graphics and 2D visual code are retained without placeholders; no external CDN is needed.

## Troubleshooting
- CSS not loading: use the full `/spra/` URL, not a folder URL or another game's server.
- Funnel refuses to start: sign in to Tailscale, enable Funnel for your device, check whether HTTPS port 443 is used.
- Port 3187 in use: in PowerShell run `powershell -File scripts/spra-funnel.ps1 -Port 3188`.
- If a public session remains active after closing the window, run STOP_SPRA_FUNNEL.bat and confirm with `tailscale funnel status`.
- iPad should use Safari or Chrome in landscape for comfortable play. Actual iPad/Funnel WAN latency depends on host performance and internet conditions.

Official help: https://tailscale.com/docs/reference/tailscale-cli/funnel

## Files
`src/`: SPRA server and ink engine only.
`public/spra/`: actual SPRA browser game, style, 2D art renderers, tutorial and city.
`public/fonts/`: local licensed pixel/UI font resources.
`scripts/` and `START/STOP_SPRA_FUNNEL.bat`: Windows hosting scripts.
`test/`: standalone integration and security checks.

Start/stop scripts must be run from the extracted SPRA_INK_BATTLE root folder.
