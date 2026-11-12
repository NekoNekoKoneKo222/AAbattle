# GLYPH INFINITY — Phase 1

`/GF` is a text-only Canvas action game. It uses the existing AAbattle account and an authoritative WebSocket simulation at `/GF/ws`.

## Play

- PC: WASD or arrows to move, mouse to aim, click or Space to attack, Shift to dash.
- iPad: left virtual stick to move, right buttons to attack and dash. Attacks face the travel direction.
- Leave the city through the gate and enter the forest. Enemies respawn; defeating them grants XP and coins. Defeat returns the player to the city.
- Position, HP, level, XP and coins save on disconnect and every 15 seconds.

## Run

From repository root: `npm ci`, `npm run build:shift`, `npm start`. Run `migrations/008_glyph_infinity.sql` on Neon before deploying to production.

## Phase scope

Implemented: character world, camera and collision, PC/touch movement, melee combat, enemy movement and attacks, five enemy tiers including THE NULL, progression and persistent saves. The city, forest, ruins and training arena have distinct procedural glyph terrain. The training arena is currently scenery only.

Planned later: skill and weapon crafting, equipment and drops, dungeon objectives, co-op, ranked PvP and seasonal systems. Those features are not shown as playable in this phase.
