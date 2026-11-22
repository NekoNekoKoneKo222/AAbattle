# SPRA — INK BATTLE / Tailscale Funnel edition

This launches **only SPRA** on Windows and exposes it at \`https://your-device.your-tailnet.ts.net/spra/\` through Tailscale Funnel. Other AAbattle games and accounts are **not hosted** by this entrypoint.

## Requirements

- Windows 10/11, Node.js **20+**, npm and Tailscale (signed in)
- GitHub repository \`NekoNekoKoneKo222/AAbattle\` with its full \`public/spra\`, \`src/spra*\`, and \`public/fonts\` folders
- Tailscale Funnel enabled in your tailnet (MagicDNS and HTTPS certificates enabled)
- A private, unique shared passphrase between **12 and 128 characters**

## Start and publish

1. Download or clone **the full AAbattle repository** (not just this file) and open its top-level folder.
2. Double-click **\`START_SPRA_FUNNEL.bat\`**. It installs Node dependencies the first time.
3. Enter a strong passphrase (never publish it to GitHub, game invites or screenshots).
4. The launcher starts \`src/spra-funnel-server.js\` on **127.0.0.1:3187** and checks HTML/CSS/JS/font MIME delivery using an authenticated local session.
5. When the check succeeds, it starts \`tailscale funnel --https=443 --bg 127.0.0.1:3187\` and shows its status.
6. Share \`https://YOUR-DEVICE.YOUR-TAILNET.ts.net/spra/\` with friends; share the passphrase separately. Friends do **not** need Tailscale installed.
7. Press Enter in the launcher window to shut down and disable this Funnel; if the window was closed abruptly, run \`STOP_SPRA_FUNNEL.bat\`.

**Do not** forward port 3000 from \`npm start\`: that is the whole AAbattle server and contains other games and APIs. Do **not** run \`npm run routes\` as a SPRA hosting substitute: it redirects to a different server.

### Manual launch

From the repository root, set \`SPRA_FRIEND_PASSWORD\` in your local **process environment** (not in a committed file), optionally set \`SPRA_PORT=3187\`, and run:

\`\`\`powershell
npm ci --omit=dev
node src/spra-funnel-server.js
\`\`\`

In another terminal:

\`\`\`powershell
tailscale funnel --https=443 --bg 127.0.0.1:3187
tailscale funnel status
# To stop sharing:
tailscale funnel --https=443 off
\`\`\`

## Security design and limits

- Node listens **only on loopback**, not 0.0.0.0. Funnel terminates HTTPS.
- The only public routes are the illustrated password gateway, its tiny stylesheet/script and \`/healthz\`.
- Friend cookie is random (256 bits), \`HttpOnly; SameSite=Strict; Path=/\` and \`Secure\` for the HTTPS public origin. Tokens are SHA-256 digests server-side, have a 12-hour expiry, and disappear on restart.
- All \`/spra/*\` assets, \`/fonts/*\`, leaderboard and gameplay WebSockets require a valid session.
- WebSocket upgrade checks \`Origin\` (host and protocol), path and session. Connections are capped globally and per session; SPRA's existing server validates gameplay and limits input frequency and message size.
- CSP, \`nosniff\`, no-store, no framing, no camera/microphone/geolocation.
- Login has a bounded JSON body, scrypt-based constant-time password checking, and limited failed guesses.
- The IP of visitors may be hidden by Funnel's proxy. Therefore login-attempt throttling is **global**, potentially blocking friends temporarily if an attacker exhausts it. Never assume Funnel itself provides friend-only access.
- **This is not cheat-proof account protection.** Current SPRA coins, XP, owned weapons, furniture and costumes remain in browser localStorage and are client-editable. Rankings on the standalone server are in memory until shutdown, and players are identified by display name. For trusted friends this is an initial private playtest setup, **not** a public ranked-money system.
- Password alone does not protect against sharing/leaks, phishing, compromised client PCs or vulnerabilities in dependencies. Update Node and npm dependencies; share access only with trusted players.

## CSS / paths / graphics

The real SPRA 2D look is unchanged. It serves the original \`public/spra/index.html\`, \`style.css\`, the actual game scripts, procedural/pixel-rendered art, and the existing local \`public/fonts\` resources. No placeholder textures or CDN dependencies were introduced. All routes keep the original \`/spra/\` prefix, so existing game asset URLs and \`wss://.../spra/ws\` resolve without rewritten prefixes.

## Troubleshooting

- **Could not find Node/npm/tailscale**: install the missing program and restart the terminal.
- **Funnel permission denied**: approve Funnel in your Tailscale admin panel; enable MagicDNS and HTTPS. Check \`tailscale status\`.
- **Wrong page / CSS 404**: use \`/spra/\` on the exact displayed HTTPS Funnel origin; run the launcher health check. Do not point Funnel to a static folder, \`npm start\`, or a redirect server.
- **Password rejected / 429**: use the exact original passphrase; if too many attempts, restart the dedicated server or allow 15 minutes.
- **WebSocket disconnected**: inspect browser DevTools Network (WS); verify login cookie was accepted and origin is the same HTTPS host.
- **Port already in use**: free 3187 or run \`powershell -File scripts/spra-funnel.ps1 -Port 3188\`.
- **Existing Funnel :443 config**: don't overwrite an unrelated Funnel. Stop/change it intentionally first or run manual HTTPS 8443 (your friends must include \`:8443\` in the URL).
- **Privacy**: stop the Funnel after your play session. \`tailscale funnel status\` confirms what remains exposed.

## Tests

CI: \`node --test test/spra-funnel.test.js\` (auth, MIME, isolated routing, WS).
Browser CI: \`node --test test/spra-funnel-browser.test.js\` with Playwright Chromium installed.
Other SPRA art, physics, performance and PvP checks remain in the existing SPRA workflow.
