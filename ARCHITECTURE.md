# Pawtown architecture

`terrain.mjs` defines a continuous river valley with a resampled elevation
patch from Bidoup around the opening settlement. Beyond that region, terrain,
tributaries and smaller settlements are generated from world coordinates.
`world.mjs` reuses a pool of 25 terrain chunks, each 48 metres wide. The inner
ring is ready when crossing a boundary. The outer ring is filled one chunk per
frame, underneath the distance haze. Render coordinates are recentered at
each chunk boundary while the simulation keeps world coordinates.

The terrain mesh and locomotion share a triangular height field. Each loaded
chunk supplies the height samples used by physics. Boats and wildlife have
bounded instance counts. Water is rendered as an animated strip along each
channel. Fish appear below its transparent surface. The dog can wade or swim
between banks. `village.mjs` defines traversable bridges, house floors and
stairs alongside wall and post collision shapes.

The engine runs movement at 60 fixed steps per second and interpolates render
positions. The third-person camera shortens its reach around obstacles. Plants
and houses use GPU instancing. Distant foliage uses lower-detail meshes or
rendered impostors. Sun shadows refresh when the chunk origin changes, and
frame-time sampling controls the drawing-buffer resolution.

The 1.82 MB environment package uses imported models and surface photography
with WebP textures and Meshopt geometry. `npm run build` verifies content
fingerprints and copies the local assets into `dist/`. The static output works
with Vercel, Docker and the Node server. See
[environment sources](public/licenses/FOREST_ASSETS.html).
