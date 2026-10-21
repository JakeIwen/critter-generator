# Critter Generator

Vanilla JavaScript/Vite frontend with an Express server and SQLite persistence. Node 22.13 or newer is required. The public deployment is owned by `../lionfeather-edge/apps/critter/`; this checkout has no persistent Mac service.

## Where things live

- `src/main.js`: browser bootstrap only.
- `src/studio.js`: laboratory, collection, generation-job, and specimen UI orchestration.
- `src/viewer.js`: Three.js specimen viewer.
- `src/style.css`: the single frontend stylesheet and design-token owner.
- `shared/sliders.mjs`: canonical slider definitions shared by browser and server.
- `shared/specimen.mjs`: canonical input/anatomy schemas and generation prompts.
- `server/index.mjs`: Express wiring and generation lifecycle.
- `server/codex.mjs`: Codex app-server boundary.
- `server/store.mjs`: SQLite and specimen-asset persistence.
- `server/geometry.mjs`: solid geometry, STL, and OpenSCAD generation.
- `server/access.mjs` and `server/login.mjs`: optional public-host authentication.
- `scripts/verify-http.mjs`: HTTP and binary-output checks against a running isolated server.

## Working agreements

- Run `npm test` and `npm run build` before committing. Run `npm run verify:http` against an isolated server when server behavior changes.
- `.local/critters.sqlite` and `.local/specimens/` are authoritative user data. Never use them in tests or replace them during deployment.
- Preserve `server/index.mjs`, port 4329, loopback binding, and asset/API routes as deployment contracts.
- Live generation is nondeterministic and is not a refactor oracle. Compare fixed specimen HTTP bodies, STL/SCAD bytes, DOM, and computed styles instead.
