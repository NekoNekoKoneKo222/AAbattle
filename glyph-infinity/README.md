# GLYPH INFINITY — Phase 1

`/GF` is a text-only Canvas action game. It uses the existing AAbattle account and an authoritative WebSocket simulation at `/GF/ws`.

## Play

- PC or iPad with an external keyboard: WASD or arrows to move, J / Enter / Space to attack, Shift to dash, M to open the world map, Esc to close it. A mouse can still aim and attack.
- iPad touch: left virtual stick to move, right buttons to attack and dash. Attacks face the travel direction. Tap the minimap or header map button to open the world map.
- Leave the city through the gate and enter the forest. Enemies respawn; defeating them grants XP and coins. Defeat returns the player to the city.
- Position, HP, level, XP and coins save on disconnect and every 15 seconds.
- Combat uses a three-hit melee combo, nearby auto-targeting for keyboard/touch players, a short invulnerable dodge, enemy attack warnings and moving ranged projectiles. The client interpolates server snapshots and caches nearby terrain tiles to keep motion smooth while the server still decides hits and movement.

## Edit the world

Edit [`world.txt`](world.txt) to change the authored terrain. `@origin X Y` gives the tile coordinate of the first character in the first row; each character represents one tile, and all rows must have equal width. `.` and spaces are walkable ground, `:` is a road, `#` a wall, `T` a tree, `~` water, `^` rock, `+` a landmark, and `S` the starting point. Walls, trees, water and rocks block movement. Outside the text grid the existing procedural terrain remains. Restart the local server or commit the file and redeploy Render to apply edits for everyone. The game and collision server load the same file.

## Run

From repository root: `npm ci`, `npm run build:shift`, `npm start`. Run `migrations/008_glyph_infinity.sql` on Neon before deploying to production.

## Phase scope

Implemented: character world, camera and collision, PC/touch movement, melee combat, enemy movement and attacks, five enemy tiers including THE NULL, progression and persistent saves. The city, forest, ruins and training arena have distinct procedural glyph terrain. The training arena is currently scenery only.

Planned later: skill and weapon crafting, equipment and drops, dungeon objectives, co-op, ranked PvP and seasonal systems. Those features are not shown as playable in this phase.
