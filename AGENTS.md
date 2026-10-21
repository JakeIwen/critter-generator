# Critter Generator

Vanilla JavaScript/Vite frontend with an Express server and SQLite persistence. Node 22.13 or newer is required. The public deployment is owned by `../lionfeather-edge/apps/critter/`; this checkout has no persistent Mac service.

## Where things live

- `src/main.js`: browser bootstrap only.
- `src/studio.js`: thin browser feature wiring and page navigation.
- `src/template.js`, `src/icons.js`, and `src/presets.js`: application markup, SVG icons, and generator presets.
- `src/generation-form.js` and `src/generation-jobs.js`: generator inputs and job lifecycle.
- `src/specimen-view.js`, `src/collection.js`, and `src/specimen-format.js`: specimen stage, collection rendering, and shared specimen display formatting.
- `src/api.js` and `src/connection.js`: shared browser API and Codex connection status boundaries.
- `src/viewer.js`: Three.js specimen viewer.
- `src/style.css`: the single frontend stylesheet and design-token owner.
- `shared/sliders.mjs`: canonical slider definitions shared by browser and server.
- `shared/specimen.mjs`: canonical input/anatomy schemas and generation prompts.
- `server/index.mjs`: Express wiring and generation lifecycle; `CRITTER_DIST_DIR` selects the static asset root for isolated checks.
- `server/codex.mjs`: Codex app-server boundary.
- `server/store.mjs`: SQLite and specimen-asset persistence.
- `server/geometry.mjs`: solid geometry, STL, and OpenSCAD generation.
- `server/access.mjs` and `server/login.mjs`: optional public-host authentication.
- `scripts/check.mjs`: complete isolated suite (`npm run check`).
- `scripts/verify-http.mjs`: HTTP and binary-output checks against a running isolated server.
- `scripts/compare-browser.js`: browser_clean refactor oracle for desktop/phone DOM and computed styles.

## Working agreements

- Run `npm run check` before committing. It runs every unit test, builds into a temporary directory, starts a server with a temporary data root and port, then runs HTTP and binary-download verification. It substitutes an offline Codex executable and checks that it was used; it must not use `.local`, Codex credentials, or live generation.
- `.local/critters.sqlite` and `.local/specimens/` are authoritative user data. Never use them in tests or replace them during deployment.
- Preserve `server/index.mjs`, port 4329, loopback binding, and asset/API routes as deployment contracts.
- Live generation is nondeterministic and is not a refactor oracle. Compare fixed specimen HTTP bodies, STL/SCAD bytes, DOM, and computed styles instead.
