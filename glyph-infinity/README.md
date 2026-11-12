# GLYPH INFINITY — Phases 1–4

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

## Phase 3 RPG and PvE

Open **Adventure** with **I** or the header button. Enemies award XP and level the player up to Lv.100. Ordinary enemies can drop one of four equipment slots; bosses always drop equipment. Each item has an individual ID, one of seven rarities, and a random HP, attack, or defense option. The account inventory holds 60 items. Equip, enhance (up to +10), reroll the option, favorite, or dismantle items in the Adventure panel. Favorites cannot be dismantled. The server checks all costs and ownership.

At Lv.2, start the private three-wave Void Ruins dungeon from Adventure. Wave 3 is THE NULL, which speeds up and attacks harder below half HP. Clearing grants coins and crystal; defeat or retreat returns to the prior position. Quests give one-time rewards for kills, boss kills, and clears. Kills also advance mastery for the equipped weapon class. At Lv.100, rebirth returns to Lv.1, retains gear and mastery, and adds a capped attack bonus. RPG progress is stored in the existing `glyph_crafting` JSONB, so Phase 3 needs no new database migration.

## Phase 4 open world

Outside the authored `world.txt` grid, terrain is generated deterministically in 64×64 tile chunks. The world now spans 257×257 tiles, with a 16-chunk bounded cache. The city, ancient forest, mine, desert, fallen city, anomaly region, abyss and outer boundary have distinct terrain and danger levels. Biome enemies appear near the player; higher danger areas have stronger elite or boss enemies and different material drops. The original enemies and authored map are preserved.

Explore to reveal chunks on the world map (**M**) and discover waypoints. From any discovered waypoint, travel to another discovered waypoint on the map. Map clicks place a local destination marker. Discovery, opened chests, and daily event claims save to the existing AAbattle account JSONB. Each interior chunk has one chest; press **F** near it for a one-time reward. The hidden letter archive awards crystals once discovered. The current daily event rotates between three regions at midnight Japan time and grants one reward per account per day.

In the city, press **F** near the guide or merchant to talk. At the merchant, open the map and buy iron or wood for 10 coins, or crystal for 25 coins. The server checks proximity, costs, visited waypoints, and reward claims. Fast travel is disabled inside dungeons.

## Edit the world

Edit [`world.txt`](world.txt) to change the authored terrain. `@origin X Y` gives the tile coordinate of the first character in the first row; each character represents one tile, and all rows must have equal width. `.` and spaces are walkable ground, `:` is a road, `#` a wall, `T` a tree, `~` water, `^` rock, `+` a landmark, and `S` the starting point. Walls, trees, water and rocks block movement. Outside the text grid the existing procedural terrain remains. Restart the local server or commit the file and redeploy Render to apply edits for everyone. The game and collision server load the same file.

## Run

From repository root: `npm ci`, `npm run build:shift`, `npm start`. Apply `migrations/008_glyph_infinity.sql` and `migrations/009_glyph_crafting.sql` on Neon before deploying to production.

## Phase scope

Implemented: character world, camera and collision, PC/touch movement, melee combat, enemy movement and attacks, five enemy tiers including THE NULL, progression and persistent saves. The city, forest, ruins and training arena have distinct procedural glyph terrain. Phase 2 adds the working workshop, saved skill graphs, four skill slots, weapon crafting, timed parry and a training dummy. Phase 3 adds the account inventory, equipment options and enhancement, quests, a three-wave dungeon, mastery and rebirth. Phase 4 adds chunk generation, biomes, exploration saves, waypoints, chests, NPCs, a merchant, daily events and a hidden area.

Planned later: the remaining skill parts, equipment sets and inheritance, co-op, ranked PvP and seasonal systems.
