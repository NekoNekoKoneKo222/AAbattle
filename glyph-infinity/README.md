# GLYPH INFINITY — Phases 1–2

`/GF` is a text-only Canvas action game. It uses the existing AAbattle account and an authoritative WebSocket simulation at `/GF/ws`.

## Play

- PC or iPad with an external keyboard: WASD or arrows to move, J / Enter / Space to attack, Shift to dash, M to open the world map, Esc to close it. A mouse can still aim and attack.
- iPad touch: left virtual stick to move, right buttons to attack and dash. Attacks face the travel direction. Tap the minimap or header map button to open the world map.
- Leave the city through the gate and enter the forest. Enemies respawn; defeating them grants XP and coins. Defeat returns the player to the city.
- Position, HP, level, XP and coins save on disconnect and every 15 seconds.
- Combat uses a three-hit melee combo, nearby auto-targeting for keyboard/touch players, a short invulnerable dodge, enemy attack warnings and moving ranged projectiles. The client interpolates server snapshots and caches nearby terrain tiles to keep motion smooth while the server still decides hits and movement.

## Phase 2 crafting

Open the workshop with **K** or the header button. Add and drag nodes, connect an output to an input by dragging or tapping, and tap an edge's × to disconnect it. Name the skill, choose one effect glyph, save it, then equip it in slots 1–4. Keyboard **1–4** or the on-screen skill buttons cast it; **Q** parries during an enemy warning. The workshop's test tab teleports to an invulnerable-to-farming training dummy and can return to town.

The currently implemented skill parts are 4 triggers (normal, melee, shot, counter), 7 target shapes, 7 elements, 6 effects, 3 conditions, and 4 modifiers. JSON graphs are checked on both client and server: at most 12 nodes, 18 edges, depth 9, execution budget 32, total skill cost 100, no cycles, no arbitrary code. EP use and cooldown rise with cost. Conditions can branch effects on hit, low HP, or a successful parry. Other parts from the original design are reserved for later work.

Weapon crafting supports all 12 listed base types and one optional secondary type for hybrid weapons. Material, element, special effect and display glyph affect the server-authoritative attack. Enemies award crafting material; weapon costs are charged on creation. Salvaging returns half the material cost. Skill graphs, weapons, materials and equipped slots save to the AAbattle account.

## Edit the world

Edit [`world.txt`](world.txt) to change the authored terrain. `@origin X Y` gives the tile coordinate of the first character in the first row; each character represents one tile, and all rows must have equal width. `.` and spaces are walkable ground, `:` is a road, `#` a wall, `T` a tree, `~` water, `^` rock, `+` a landmark, and `S` the starting point. Walls, trees, water and rocks block movement. Outside the text grid the existing procedural terrain remains. Restart the local server or commit the file and redeploy Render to apply edits for everyone. The game and collision server load the same file.

## Run

From repository root: `npm ci`, `npm run build:shift`, `npm start`. Apply `migrations/008_glyph_infinity.sql` and `migrations/009_glyph_crafting.sql` on Neon before deploying to production.

## Phase scope

Implemented: character world, camera and collision, PC/touch movement, melee combat, enemy movement and attacks, five enemy tiers including THE NULL, progression and persistent saves. The city, forest, ruins and training arena have distinct procedural glyph terrain. Phase 2 adds the working workshop, saved skill graphs, four skill slots, weapon crafting, timed parry and a training dummy.

Planned later: the remaining skill parts, equipment drops and inventory, dungeon objectives, co-op, ranked PvP and seasonal systems.
