# Critter Generator

Vanilla JavaScript/Vite frontend with an Express server and SQLite persistence. Node 22.13 or newer is required. The public deployment is owned by `../lionfeather-edge/apps/critter/`; this checkout has no persistent Mac service.

## Contracts

| Path | Caller | Owner |
|---|---|---|
| `server/index.mjs` | `npm start`, `npm run serve`, lionfeather-edge critter service | `server/index.mjs` |
| `scripts/check.mjs` | `npm run check`, pre-commit verification | `scripts/check.mjs` |
| `scripts/verify-http.mjs` | `npm run verify:http`, isolated check server | `scripts/verify-http.mjs` |
| `scripts/stop.mjs` | `npm run stop`, foreground operator workflow | `scripts/stop.mjs` |
| `scripts/deploy.mjs` | `npm run deploy` | `scripts/deploy.mjs` |

## Where things live

- `src/main.js`: browser bootstrap only.
- `src/studio.js`: thin browser feature wiring and page navigation.
- `src/template.js`, `src/icons.js`, and `src/presets.js`: application markup, SVG icons, and generator presets.
- `src/generation-form.js` and `src/generation-jobs.js`: generator inputs and job lifecycle.
- `src/generation-progress.js`: 130-second generation estimate, elapsed/remaining display, and timer recovery.
- `src/specimen-view.js`, `src/collection.js`, and `src/specimen-format.js`: specimen stage, collection rendering, and shared specimen display formatting.
- `src/api.js` and `src/connection.js`: shared browser API and Codex connection status boundaries.
- `src/viewer.js`: Three.js specimen viewer.
- `src/style.css`: the single frontend stylesheet and design-token owner.
- `shared/sliders.mjs`: canonical slider definitions shared by browser and server.
- `shared/print-settings.mjs`: canonical print-height range shared by browser, validation, and CAD generation.
- `shared/specimen.mjs`: canonical settings, biological descriptions, optional print-anatomy schemas and generation/image prompts.
- `shared/animal-types.mjs`: familiar animal inspiration groups, fictional flags, traits, habitats and simplified CAD leg suggestions; research references live in `docs/animal-inspiration.md`.
- `shared/encounter-directions.mjs`: camera viewpoints, ecological encounters and biological challenges.
- `shared/body-plans.mjs`: silhouette families and physical sampling ranges.
- `shared/anatomy-plan.mjs`: seeded anatomy sampling, recent-history balancing and per-generation output validation.
- `server/index.mjs`: Express wiring and generation lifecycle; `CRITTER_DIST_DIR` selects the static asset root for isolated checks.
- `server/codex.mjs`: Codex app-server boundary.
- `server/store.mjs`: SQLite and specimen-asset persistence.
- `server/geometry.mjs`: solid geometry, STL, and OpenSCAD generation.
- `server/sculpt-head.mjs`: connected head, eyes, horns and antennae shared by the STL/SCAD recipe.
- `server/access.mjs` and `server/login.mjs`: optional public-host authentication.
- `scripts/check.mjs`: complete isolated suite (`npm run check`).
- `scripts/deploy.mjs`: invokes the hosting repo's Critter deployer with this source checkout; `npm run deploy` runs the complete suite first. `LIONFEATHER_EDGE_DIR` overrides the default sibling hosting checkout.
- `scripts/verify-http.mjs`: HTTP and binary-output checks against a running isolated server.
- `scripts/compare-browser.js`: browser_clean refactor oracle for desktop/phone DOM and computed styles.
- `tests/backend-layout.test.mjs`: focused gate for adapter direction, stable command targets and isolated-check boundaries. The generic backend-layout audit remains advisory because no layout baseline is written.

## Working agreements

- Run `npm run check` before committing. It runs every unit test, builds into a temporary directory, starts a server with a temporary data root and port, then runs HTTP and binary-download verification. It substitutes an offline Codex executable and checks that it was used; it must not use `.local`, Codex credentials, or live generation.
- `.local/critters.sqlite` and `.local/specimens/` are authoritative user data. Never use them in tests or replace them during deployment.
- Preserve `server/index.mjs`, port 4329, loopback binding, and asset/API routes as deployment contracts.
- Live generation is nondeterministic and is not a refactor oracle. Compare fixed specimen HTTP bodies, STL/SCAD bytes, DOM, and computed styles instead.
- Print heights are 60–500 mm, including the optional baseplate. Omitted `baseplate` settings default to enabled for older clients and saved recipes; never rewrite saved specimen assets to change this choice.
- New forms default to `printModel: false`; omitted API settings default to true for older clients. Image-only records have `anatomy: null` and `print: null`, keep full `biology`, and never create or serve CAD assets. Saved models remain unchanged.
- Animal chips select an inspiration pool (`animalTypes: []` means all); sample 1–3 groups for each lifeform. `legless` forces zero biological and CAD legs even when text conflicts. Octopus arms, fins and tube feet are not paired walking legs.
- New jobs persist versioned inspiration, biological challenge and camera/encounter choices in `variation`. The image follows full biology and habitat; print anatomy is a simplified approximation. Empty-text printable generations lock sampled CAD traits; text can override those traits within the print schema. Portrait retries reuse the stored biology and scene choices. Legacy head/stance multipliers default to 1 and horn sweep to 0.
