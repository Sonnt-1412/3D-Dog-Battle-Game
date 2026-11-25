<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
# Pawtown Nightfall architecture
||||||| parent of c01158c (Simplify Pawtown to a single-dog FPS playground)
# Pawtown Nightfall architecture
=======
||||||| parent of 0d17f71 (still fix)
=======
<<<<<<< HEAD
>>>>>>> 0d17f71 (still fix)
||||||| parent of ab5136b (still fix)
=======
<<<<<<< HEAD
>>>>>>> ab5136b (still fix)
||||||| parent of 2375430 (still fix)
=======
<<<<<<< HEAD
>>>>>>> 2375430 (still fix)
||||||| parent of a0358a6 (still fix)
=======
<<<<<<< HEAD
>>>>>>> a0358a6 (still fix)
# Pawtown architecture
<<<<<<< HEAD
>>>>>>> c01158c (Simplify Pawtown to a single-dog FPS playground)
||||||| parent of 2375430 (still fix)
=======
||||||| parent of 1ea59e0 (ok)
# Pawtown architecture
=======
# Pawtown Nightfall architecture
>>>>>>> 1ea59e0 (ok)
<<<<<<< HEAD
>>>>>>> 2375430 (still fix)
||||||| parent of a0358a6 (still fix)
=======
||||||| parent of c01158c (Simplify Pawtown to a single-dog FPS playground)
# Pawtown Nightfall architecture
=======
# Pawtown architecture
>>>>>>> c01158c (Simplify Pawtown to a single-dog FPS playground)
>>>>>>> a0358a6 (still fix)

<<<<<<< HEAD
<<<<<<< HEAD
Pawtown ships one rigged H’Mông cộc and an open circular stage. The ground and sky
are two procedural meshes. The ground shader draws the grid, boundary, and a
contact shadow in the same pass. Both meshes use local shaders and need no
environment textures or shadow maps.

`engine.mjs` runs movement in fixed 60 Hz steps, interpolates the rendered
position, and applies mouse or touch camera input per rendered frame. The
first-person camera follows the dog's eye height. Third-person play and the
opening preview show the skinned dog. First-person play skips skin animation
and drawing. The preview draws at up to 30 Hz. Pausing draws only when the
viewport changes. Rendering caps pixel density and total buffer size, with a
smaller budget on touch devices.

`animation.mjs` blends Idle, Walk, Trot, and Gallop at a shared, distance-driven
phase. Bark uses a one-shot clip and the dog tilts with its jump velocity. `npm run models:prepare` derives the
playable GLB from the tracked H’Mông cộc source export. It keeps the rig and
gameplay clips, removes the high-poly strand mesh, simplifies the remaining
meshes, resizes textures, and writes a content-fingerprinted Meshopt export.

<<<<<<< HEAD
## Animation

`animation.mjs` blends Idle, Walk, Trot and Gallop continuously using authored
gait-speed references scaled to the dog's world height. Gaits share a
travel-driven normalized phase and are not reset at threshold crossings. Weights
and speed ease with elapsed time; tiny inactive weights are removed and the
remaining weights normalized. The mixer samples gait clips at the shared phase,
while idle breathing and one-shot gestures use time normally.

Only four gaits plus Bark and Lie_Idle get mixer actions; other source clips
remain available in the files without allocating unused animation bindings.
Gestures blend with locomotion and return to a total weight of one. A short
procedural body recoil accompanies a hit. Resident limb phase is driven by
actual travelled distance, with eased turn, stride and attack-arm motion. Ambient
dogs also use measured travel speed for their gait and flee nearby hostile NPCs
using the same collision-aware movement.

## Threats and survival

`threats.mjs` contains a renderer-independent state machine:

`patrol → suspicious → chase → windup → recover`, with a finite `search` after
losing the dog. Sight depends on distance, facing and world obstacles. Sprinting
and barking affect perception. Inactive play and refuge occupancy cancel attacks.

`residents.mjs` applies those decisions to three hostile NPCs and keeps the other
five neutral/helpful. Pursuers use collision-aware movement. Windups display a
world-space ring at a locked aim point and an overhead warning. A throw follows
a visible arc; a close shove is resolved only within reach. Once an attack starts,
its aim does not track a dodging player.

Projectiles use a small reusable pool, swept sphere hit tests, obstacle checks
and a lifetime limit. Damage has an invulnerability interval, recoil and a brief
input slowdown. It cannot affect the dog inside a refuge. Three hits enter the
caught overlay; retry restores health and removes stale projectiles. Supplies
plus a return to refuge complete the current run. E restores health/energy at a
refuge, with a short rest cooldown. Attacks are non-graphic.

## Atmosphere and assets

`world.mjs` retains the existing town geometry with a cold, desaturated palette,
wet pavement, closed shops, sparse amber lamps and marked refuges. Point lights
are bounded and do not cast additional shadows. A moon directional light follows
the player; mobile uses a smaller shadow map. `weather.mjs` generates a small
rain line buffer and procedural surface texture. No remote art or CDN is needed.

`roster.mjs` and the asset validator enforce exactly ten playable IDs. Existing
Meshopt GLBs, local Three.js and the decoder produce an approximately 35 MB build.
`assets.mjs` clones skin hierarchies, protects resources used by current/ambient
dogs and evicts unused entries beyond a three-model cache. Selection tokens
prevent late previous loads from replacing a newer choice.

## Verification and deployment

Node tests exercise motion/collision, mixer weight/phase continuity, gestures,
patrol perception, telegraph duration, locked aim, loss of sight, safe zones,
projectile sweeps and HTTP behavior. Browser checks cover real attacks/damage,
dodging, refuge healing, caught/retry cleanup, ten-model selection, pause and
native mobile touch input. Source-model decoding checks retain rig/clip validity.

Vercel serves the static build. Docker packages the same files behind the
non-root Node static server; the app has no runtime database or API secret.
Original desktop/authoring inputs remain local and unchanged.
||||||| parent of 8794121 (ok)
=======
# Architecture
||||||| parent of 6218043 (ok)
# Architecture
=======
# Pawtown architecture
>>>>>>> 6218043 (ok)
||||||| parent of 1ea59e0 (ok)
# Pawtown architecture
=======
# Pawtown Nightfall architecture
>>>>>>> 1ea59e0 (ok)
||||||| parent of c01158c (Simplify Pawtown to a single-dog FPS playground)
## Simulation and rendering
=======
Pawtown ships one rigged H’Mông cộc and an open circular stage. The ground and sky
are two procedural meshes. The ground shader draws the grid, boundary, and a
contact shadow in the same pass. Both meshes use local shaders and need no
environment textures or shadow maps.
>>>>>>> c01158c (Simplify Pawtown to a single-dog FPS playground)

<<<<<<< HEAD
## Simulation and rendering

The Three.js viewport is a rainy, foggy nighttime town. The ten-dog selection
menu hands control to the selected animated model. `choose`, `playing`, `paused`
and `caught` explicitly control input, simulation and overlays. NPCs are local;
there are no fabricated online players or database requirements.
||||||| parent of a0358a6 (still fix)
The Three.js viewport is a rainy, foggy nighttime town. The ten-dog selection
menu hands control to the selected animated model. `choose`, `playing`, `paused`
and `caught` explicitly control input, simulation and overlays. NPCs are local;
there are no fabricated online players or database requirements.
=======
`engine.mjs` runs movement in fixed 60 Hz steps, interpolates the rendered
position, and applies mouse or touch camera input per rendered frame. The
first-person camera follows the dog's eye height. Third-person play and the
opening preview show the skinned dog. First-person play skips skin animation
and drawing. The preview draws at up to 30 Hz. Pausing draws only when the
viewport changes. Rendering caps pixel density and total buffer size, with a
smaller budget on touch devices.
>>>>>>> a0358a6 (still fix)

`animation.mjs` blends Idle, Walk, Trot, and Gallop at a shared, distance-driven
phase. Bark uses a one-shot clip and the dog tilts with its jump velocity. `npm run models:prepare` derives the
playable GLB from the tracked H’Mông cộc source export. It keeps the rig and
gameplay clips, removes the high-poly strand mesh, simplifies the remaining
meshes, resizes textures, and writes a content-fingerprinted Meshopt export.

<<<<<<< HEAD
## Animation

`animation.mjs` blends Idle, Walk, Trot and Gallop continuously using authored
gait-speed references scaled to the dog's world height. Gaits share a
travel-driven normalized phase and are not reset at threshold crossings. Weights
and speed ease with elapsed time; tiny inactive weights are removed and the
remaining weights normalized. The mixer samples gait clips at the shared phase,
while idle breathing and one-shot gestures use time normally.

Only four gaits plus Bark and Lie_Idle get mixer actions; other source clips
remain available in the files without allocating unused animation bindings.
Gestures blend with locomotion and return to a total weight of one. A short
procedural body recoil accompanies a hit. Resident limb phase is driven by
actual travelled distance, with eased turn, stride and attack-arm motion. Ambient
dogs also use measured travel speed for their gait and flee nearby hostile NPCs
using the same collision-aware movement.

## Threats and survival

`threats.mjs` contains a renderer-independent state machine:

`patrol → suspicious → chase → windup → recover`, with a finite `search` after
losing the dog. Sight depends on distance, facing and world obstacles. Sprinting
and barking affect perception. Inactive play and refuge occupancy cancel attacks.

`residents.mjs` applies those decisions to three hostile NPCs and keeps the other
five neutral/helpful. Pursuers use collision-aware movement. Windups display a
world-space ring at a locked aim point and an overhead warning. A throw follows
a visible arc; a close shove is resolved only within reach. Once an attack starts,
its aim does not track a dodging player.

Projectiles use a small reusable pool, swept sphere hit tests, obstacle checks
and a lifetime limit. Damage has an invulnerability interval, recoil and a brief
input slowdown. It cannot affect the dog inside a refuge. Three hits enter the
caught overlay; retry restores health and removes stale projectiles. Supplies
plus a return to refuge complete the current run. E restores health/energy at a
refuge, with a short rest cooldown. Attacks are non-graphic.

## Atmosphere and assets

`world.mjs` retains the existing town geometry with a cold, desaturated palette,
wet pavement, closed shops, sparse amber lamps and marked refuges. Point lights
are bounded and do not cast additional shadows. A moon directional light follows
the player; mobile uses a smaller shadow map. `weather.mjs` generates a small
rain line buffer and procedural surface texture. No remote art or CDN is needed.

<<<<<<< HEAD
<<<<<<< HEAD
Python tests retain geometry, groom, developmental proportion and movement
coverage on the original authoring machine. Large review artifacts remain
ignored. Scanning, recognition, fitting and API calls have been removed.
>>>>>>> 8794121 (ok)
||||||| parent of 6218043 (ok)
Python tests retain geometry, groom, developmental proportion and movement
coverage on the original authoring machine. Large review artifacts remain
ignored. Scanning, recognition, fitting and API calls have been removed.
=======
## Delivery and verification
||||||| parent of 1ea59e0 (ok)
## Delivery and verification
=======
`roster.mjs` and the asset validator enforce exactly ten playable IDs. Existing
Meshopt GLBs, local Three.js and the decoder produce an approximately 35 MB build.
`assets.mjs` clones skin hierarchies, protects resources used by current/ambient
dogs and evicts unused entries beyond a three-model cache. Selection tokens
prevent late previous loads from replacing a newer choice.
>>>>>>> 1ea59e0 (ok)

## Verification and deployment

<<<<<<< HEAD
Node tests cover movement, collision, energy, interaction distance, character
selection and HTTP behavior. Model checks decode every playable file, verify
80-joint skins and locomotion clips, and reject non-finite mesh data. Browser QA
exercises selection, actual player movement, jumping, pause and mobile controls.
>>>>>>> 6218043 (ok)
||||||| parent of 1ea59e0 (ok)
Node tests cover movement, collision, energy, interaction distance, character
selection and HTTP behavior. Model checks decode every playable file, verify
80-joint skins and locomotion clips, and reject non-finite mesh data. Browser QA
exercises selection, actual player movement, jumping, pause and mobile controls.
=======
Node tests exercise motion/collision, mixer weight/phase continuity, gestures,
patrol perception, telegraph duration, locked aim, loss of sight, safe zones,
projectile sweeps and HTTP behavior. Browser checks cover real attacks/damage,
dodging, refuge healing, caught/retry cleanup, ten-model selection, pause and
native mobile touch input. Source-model decoding checks retain rig/clip validity.

Vercel serves the static build. Docker packages the same files behind the
non-root Node static server; the app has no runtime database or API secret.
Original desktop/authoring inputs remain local and unchanged.
>>>>>>> 1ea59e0 (ok)
<<<<<<< HEAD
||||||| parent of c01158c (Simplify Pawtown to a single-dog FPS playground)
## Animation

`animation.mjs` blends Idle, Walk, Trot and Gallop continuously using authored
gait-speed references scaled to the dog's world height. Gaits share a
travel-driven normalized phase and are not reset at threshold crossings. Weights
and speed ease with elapsed time; tiny inactive weights are removed and the
remaining weights normalized. The mixer samples gait clips at the shared phase,
while idle breathing and one-shot gestures use time normally.

Only four gaits plus Bark and Lie_Idle get mixer actions; other source clips
remain available in the files without allocating unused animation bindings.
Gestures blend with locomotion and return to a total weight of one. A short
procedural body recoil accompanies a hit. Resident limb phase is driven by
actual travelled distance, with eased turn, stride and attack-arm motion. Ambient
dogs also use measured travel speed for their gait and flee nearby hostile NPCs
using the same collision-aware movement.

## Threats and survival

`threats.mjs` contains a renderer-independent state machine:

`patrol → suspicious → chase → windup → recover`, with a finite `search` after
losing the dog. Sight depends on distance, facing and world obstacles. Sprinting
and barking affect perception. Inactive play and refuge occupancy cancel attacks.

`residents.mjs` applies those decisions to three hostile NPCs and keeps the other
five neutral/helpful. Pursuers use collision-aware movement. Windups display a
world-space ring at a locked aim point and an overhead warning. A throw follows
a visible arc; a close shove is resolved only within reach. Once an attack starts,
its aim does not track a dodging player.

Projectiles use a small reusable pool, swept sphere hit tests, obstacle checks
and a lifetime limit. Damage has an invulnerability interval, recoil and a brief
input slowdown. It cannot affect the dog inside a refuge. Three hits enter the
caught overlay; retry restores health and removes stale projectiles. Supplies
plus a return to refuge complete the current run. E restores health/energy at a
refuge, with a short rest cooldown. Attacks are non-graphic.

## Atmosphere and assets

`world.mjs` retains the existing town geometry with a cold, desaturated palette,
wet pavement, closed shops, sparse amber lamps and marked refuges. Point lights
are bounded and do not cast additional shadows. A moon directional light follows
the player; mobile uses a smaller shadow map. `weather.mjs` generates a small
rain line buffer and procedural surface texture. No remote art or CDN is needed.

`roster.mjs` and the asset validator enforce exactly ten playable IDs. Existing
Meshopt GLBs, local Three.js and the decoder produce an approximately 35 MB build.
`assets.mjs` clones skin hierarchies, protects resources used by current/ambient
dogs and evicts unused entries beyond a three-model cache. Selection tokens
prevent late previous loads from replacing a newer choice.

## Verification and deployment

Node tests exercise motion/collision, mixer weight/phase continuity, gestures,
patrol perception, telegraph duration, locked aim, loss of sight, safe zones,
projectile sweeps and HTTP behavior. Browser checks cover real attacks/damage,
dodging, refuge healing, caught/retry cleanup, ten-model selection, pause and
native mobile touch input. Source-model decoding checks retain rig/clip validity.

Vercel serves the static build. Docker packages the same files behind the
non-root Node static server; the app has no runtime database or API secret.
Original desktop/authoring inputs remain local and unchanged.
=======
`npm run build` validates the playable catalog and ships only its model, local
Three.js and the Meshopt decoder. The static build runs with the Node server
or Docker. The desktop tools use their own catalogs and models.
<<<<<<< HEAD
>>>>>>> c01158c (Simplify Pawtown to a single-dog FPS playground)
||||||| parent of 0d17f71 (still fix)
=======
||||||| parent of 8794121 (ok)
=======
# Architecture
||||||| parent of 6218043 (ok)
# Architecture
=======
# Pawtown architecture
>>>>>>> 6218043 (ok)

## Playable world
||||||| parent of 1ea59e0 (ok)
## Playable world
=======
## Simulation and rendering
>>>>>>> 1ea59e0 (ok)

The Three.js viewport is a rainy, foggy nighttime town. The ten-dog selection
menu hands control to the selected animated model. `choose`, `playing`, `paused`
and `caught` explicitly control input, simulation and overlays. NPCs are local;
there are no fabricated online players or database requirements.

`engine.mjs` accumulates a bounded frame delta into 60 Hz simulation steps.
Movement, collision, patrol decisions and projectiles use those steps. The
player's rendered position interpolates the previous/current simulation states.
Rendering, rain and skeletal sampling follow the display rate. Pausing freezes
simulation and animation; camera damping remains independent of simulation.
HUD snapshots are produced roughly every 80 ms, rather than allocating the
resident/map/status arrays on every rendered frame. Collider objects and camera
vectors are reused.

## Animation

`animation.mjs` blends Idle, Walk, Trot and Gallop continuously using authored
gait-speed references scaled to the dog's world height. Gaits share a
travel-driven normalized phase and are not reset at threshold crossings. Weights
and speed ease with elapsed time; tiny inactive weights are removed and the
remaining weights normalized. The mixer samples gait clips at the shared phase,
while idle breathing and one-shot gestures use time normally.

Only four gaits plus Bark and Lie_Idle get mixer actions; other source clips
remain available in the files without allocating unused animation bindings.
Gestures blend with locomotion and return to a total weight of one. A short
procedural body recoil accompanies a hit. Resident limb phase is driven by
actual travelled distance, with eased turn, stride and attack-arm motion. Ambient
dogs also use measured travel speed for their gait and flee nearby hostile NPCs
using the same collision-aware movement.

## Threats and survival

`threats.mjs` contains a renderer-independent state machine:

`patrol → suspicious → chase → windup → recover`, with a finite `search` after
losing the dog. Sight depends on distance, facing and world obstacles. Sprinting
and barking affect perception. Inactive play and refuge occupancy cancel attacks.

`residents.mjs` applies those decisions to three hostile NPCs and keeps the other
five neutral/helpful. Pursuers use collision-aware movement. Windups display a
world-space ring at a locked aim point and an overhead warning. A throw follows
a visible arc; a close shove is resolved only within reach. Once an attack starts,
its aim does not track a dodging player.

Projectiles use a small reusable pool, swept sphere hit tests, obstacle checks
and a lifetime limit. Damage has an invulnerability interval, recoil and a brief
input slowdown. It cannot affect the dog inside a refuge. Three hits enter the
caught overlay; retry restores health and removes stale projectiles. Supplies
plus a return to refuge complete the current run. E restores health/energy at a
refuge, with a short rest cooldown. Attacks are non-graphic.

## Atmosphere and assets

`world.mjs` retains the existing town geometry with a cold, desaturated palette,
wet pavement, closed shops, sparse amber lamps and marked refuges. Point lights
are bounded and do not cast additional shadows. A moon directional light follows
the player; mobile uses a smaller shadow map. `weather.mjs` generates a small
rain line buffer and procedural surface texture. No remote art or CDN is needed.

<<<<<<< HEAD
<<<<<<< HEAD
Python tests retain geometry, groom, developmental proportion and movement
coverage on the original authoring machine. Large review artifacts remain
ignored. Scanning, recognition, fitting and API calls have been removed.
>>>>>>> 8794121 (ok)
<<<<<<< HEAD
>>>>>>> 0d17f71 (still fix)
||||||| parent of ab5136b (still fix)
=======
||||||| parent of 6218043 (ok)
Python tests retain geometry, groom, developmental proportion and movement
coverage on the original authoring machine. Large review artifacts remain
ignored. Scanning, recognition, fitting and API calls have been removed.
=======
## Delivery and verification
||||||| parent of 1ea59e0 (ok)
## Delivery and verification
=======
`roster.mjs` and the asset validator enforce exactly ten playable IDs. Existing
Meshopt GLBs, local Three.js and the decoder produce an approximately 35 MB build.
`assets.mjs` clones skin hierarchies, protects resources used by current/ambient
dogs and evicts unused entries beyond a three-model cache. Selection tokens
prevent late previous loads from replacing a newer choice.
>>>>>>> 1ea59e0 (ok)

## Verification and deployment

<<<<<<< HEAD
Node tests cover movement, collision, energy, interaction distance, character
selection and HTTP behavior. Model checks decode every playable file, verify
80-joint skins and locomotion clips, and reject non-finite mesh data. Browser QA
exercises selection, actual player movement, jumping, pause and mobile controls.
>>>>>>> 6218043 (ok)
<<<<<<< HEAD
>>>>>>> ab5136b (still fix)
||||||| parent of 2375430 (still fix)
=======
||||||| parent of 1ea59e0 (ok)
Node tests cover movement, collision, energy, interaction distance, character
selection and HTTP behavior. Model checks decode every playable file, verify
80-joint skins and locomotion clips, and reject non-finite mesh data. Browser QA
exercises selection, actual player movement, jumping, pause and mobile controls.
=======
Node tests exercise motion/collision, mixer weight/phase continuity, gestures,
patrol perception, telegraph duration, locked aim, loss of sight, safe zones,
projectile sweeps and HTTP behavior. Browser checks cover real attacks/damage,
dodging, refuge healing, caught/retry cleanup, ten-model selection, pause and
native mobile touch input. Source-model decoding checks retain rig/clip validity.

Vercel serves the static build. Docker packages the same files behind the
non-root Node static server; the app has no runtime database or API secret.
Original desktop/authoring inputs remain local and unchanged.
>>>>>>> 1ea59e0 (ok)
>>>>>>> 2375430 (still fix)
||||||| parent of a0358a6 (still fix)
=======
||||||| parent of c01158c (Simplify Pawtown to a single-dog FPS playground)
## Animation

`animation.mjs` blends Idle, Walk, Trot and Gallop continuously using authored
gait-speed references scaled to the dog's world height. Gaits share a
travel-driven normalized phase and are not reset at threshold crossings. Weights
and speed ease with elapsed time; tiny inactive weights are removed and the
remaining weights normalized. The mixer samples gait clips at the shared phase,
while idle breathing and one-shot gestures use time normally.

Only four gaits plus Bark and Lie_Idle get mixer actions; other source clips
remain available in the files without allocating unused animation bindings.
Gestures blend with locomotion and return to a total weight of one. A short
procedural body recoil accompanies a hit. Resident limb phase is driven by
actual travelled distance, with eased turn, stride and attack-arm motion. Ambient
dogs also use measured travel speed for their gait and flee nearby hostile NPCs
using the same collision-aware movement.

## Threats and survival

`threats.mjs` contains a renderer-independent state machine:

`patrol → suspicious → chase → windup → recover`, with a finite `search` after
losing the dog. Sight depends on distance, facing and world obstacles. Sprinting
and barking affect perception. Inactive play and refuge occupancy cancel attacks.

`residents.mjs` applies those decisions to three hostile NPCs and keeps the other
five neutral/helpful. Pursuers use collision-aware movement. Windups display a
world-space ring at a locked aim point and an overhead warning. A throw follows
a visible arc; a close shove is resolved only within reach. Once an attack starts,
its aim does not track a dodging player.

Projectiles use a small reusable pool, swept sphere hit tests, obstacle checks
and a lifetime limit. Damage has an invulnerability interval, recoil and a brief
input slowdown. It cannot affect the dog inside a refuge. Three hits enter the
caught overlay; retry restores health and removes stale projectiles. Supplies
plus a return to refuge complete the current run. E restores health/energy at a
refuge, with a short rest cooldown. Attacks are non-graphic.

## Atmosphere and assets

`world.mjs` retains the existing town geometry with a cold, desaturated palette,
wet pavement, closed shops, sparse amber lamps and marked refuges. Point lights
are bounded and do not cast additional shadows. A moon directional light follows
the player; mobile uses a smaller shadow map. `weather.mjs` generates a small
rain line buffer and procedural surface texture. No remote art or CDN is needed.

`roster.mjs` and the asset validator enforce exactly ten playable IDs. Existing
Meshopt GLBs, local Three.js and the decoder produce an approximately 35 MB build.
`assets.mjs` clones skin hierarchies, protects resources used by current/ambient
dogs and evicts unused entries beyond a three-model cache. Selection tokens
prevent late previous loads from replacing a newer choice.

## Verification and deployment

Node tests exercise motion/collision, mixer weight/phase continuity, gestures,
patrol perception, telegraph duration, locked aim, loss of sight, safe zones,
projectile sweeps and HTTP behavior. Browser checks cover real attacks/damage,
dodging, refuge healing, caught/retry cleanup, ten-model selection, pause and
native mobile touch input. Source-model decoding checks retain rig/clip validity.

Vercel serves the static build. Docker packages the same files behind the
non-root Node static server; the app has no runtime database or API secret.
Original desktop/authoring inputs remain local and unchanged.
=======
`npm run build` validates the playable catalog and ships only its model, local
Three.js and the Meshopt decoder. The static build runs with the Node server
or Docker. The desktop tools use their own catalogs and models.
>>>>>>> c01158c (Simplify Pawtown to a single-dog FPS playground)
>>>>>>> a0358a6 (still fix)
