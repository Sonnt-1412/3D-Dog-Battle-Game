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
# Pawtown architecture
>>>>>>> c01158c (Simplify Pawtown to a single-dog FPS playground)

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

## Simulation and rendering

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

## Browser application

`web/` is a static model viewer built around the self-hosted `<model-viewer>`
component. `catalog.mjs` contains filtering and selection logic, independent of
rendering. `main.mjs` connects that state to the UI, model loading and animation
controls. The last selected dog is optional browser-local state.

`public/catalog.json` describes the 317 available dogs using relative asset URLs.
The browser fetches the selected compressed GLB on demand. Its cache retains at
most two models; it does not preload the whole library. No database or backend
application service is used.

## Build and delivery

`npm run build` validates every asset reference, copies `web/` and `public/` to
`dist/`, and adds the locked model-viewer bundle and local Meshopt decoder.
Deployments never run Blender or need the original 8 GB of models.

Vercel serves the static `dist/` output from the GitHub source. The Docker image
builds that same output in a Node builder stage, then serves it using a small,
non-root Node runtime. `server.mjs` supports HEAD and byte ranges, rejects writes,
and prevents traversal or symlink access outside `dist/`. Compose additionally
runs the container with a read-only filesystem.

Model URLs include a fingerprint of the original file and export settings. They
can be cached as immutable; the catalog is revalidated. Source license notices
are included in the website and image.

## Original assets and authoring

`dog_catalog.json` describes 294 base variants and `custom_catalog.json` describes
23 standalone custom models. `scripts/prepare-web-models.mjs` reads these original
local GLBs, optimizes repeated accessors/animation tracks, compresses the geometry
and animation data with Meshopt, and creates smaller WebP textures. It writes new
files under `public/models/`; it never modifies the originals.

The full source files under `assets/` and `Textures/` stay local and are excluded
from Git and the Docker build context. The prebuilt web copies are tracked so a
fresh checkout can build without proprietary authoring inputs or Blender.

The retained Python desktop entry points use `catalog.py` to access base and
saved exports. This module imports only the standard library. `model_assets.py`
provides cached GLB metadata and offline binary access without SciPy or Pillow.
`tools/` holds explicit asset-authoring and validation commands; it never runs
from a browser request or the desktop render loop.

## Verification

Node tests cover filtering, remembered/shared selection, static HTTP delivery,
byte ranges and filesystem containment. `scripts/check-web-models.mjs` decodes
all compressed files with the same Meshopt decoder used by the viewer, checks
80-joint skins and locomotion clips, and verifies finite geometry arrays.

Python tests retain geometry, groom, developmental proportion and movement
coverage on the original authoring machine. Large review artifacts remain
ignored. Scanning, recognition, fitting and API calls have been removed.
>>>>>>> 8794121 (ok)
>>>>>>> 0d17f71 (still fix)
