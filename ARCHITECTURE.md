# Pawtown architecture

The pine trail uses a resampled SRTM elevation grid from the Bidoup area.
`terrain.mjs` samples the same triangles that `world.mjs` renders, so the
dog, props and chase camera share the surface. The trail follows editable
waypoints. Trees and rocks use simple colliders.

`engine.mjs` runs movement at 60 fixed steps per second and interpolates the
render position. The chase camera orbits the dog, zooms on desktop and shortens
its reach near hills and foliage. Rendering aims for 60 Hz while playing and
24 Hz on the opening screen. The pixel budget is lower on touch devices and
reduces further when sustained frame times rise.

The map uses imported models and photos with WebP textures and Meshopt geometry.
Repeated plants and props use GPU instancing. Distant spruce trees use rendered
impostors, and the renderer culls understory beyond its useful distance.
Sun shadows are rendered once at load. A contact shadow follows the dog in
the terrain shader. The existing dog animation shares a distance-driven gait
phase and uses a one-shot bark clip.

`npm run build` verifies the fingerprinted local assets and copies them into
`dist/`. The map adds 1.28 MB of model and texture data. The browser loads
the environment and dog in parallel from the same origin. The same output
works with Vercel, Docker or the local Node server. See
[environment sources](public/licenses/FOREST_ASSETS.html) for the original assets.
