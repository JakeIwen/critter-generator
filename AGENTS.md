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
| `scripts/evaluate.mjs` | `npm run evaluate` | `scripts/evaluate.mjs`, `server/evaluation-run.mjs` |

## Where things live

- `src/main.js`: browser bootstrap only.
- `src/studio.js`: thin browser feature wiring.
- `src/router.js` and `shared/page-routes.mjs`: History-API navigation, canonical page paths and specimen permalinks shared with the server fallback.
- `src/template.js`, `src/icons.js`, and `src/presets.js`: application markup, SVG icons, and generator presets.
- `src/generation-form.js` and `src/generation-directions.js`: generator inputs, explicit requirements, direction locks and frozen preview.
- `src/generation-jobs.js`: browser job lifecycle for discoveries, portrait updates and on-demand CAD.
- `src/generation-progress.js`: progress against the job's frozen estimate, stable estimated-total display, and timer recovery.
- `src/specimen-view.js`, `src/specimen-actions.js`, `src/collection.js`, and `src/specimen-format.js`: specimen stage, versioned portrait/edit/CAD controls, collection and shared display formatting.
- `src/api.js` and `src/connection.js`: shared browser API and Codex connection status boundaries.
- `src/viewer.js`: Three.js specimen viewer.
- `src/style.css`: the single frontend stylesheet and design-token owner.
- `shared/app-settings.mjs`: browser-safe app-setting definitions/defaults, groups and public configuration subset.
- `server/app-settings.mjs`: strict HTTP validation derived from those definitions and stored-value merging.
- `src/app-settings-card.js`: grouped owner app-settings form, draft reset and persistence.
- `shared/sliders.mjs`: canonical slider definitions shared by browser and server.
- `shared/print-settings.mjs`: canonical print-height range shared by browser, validation, and CAD generation.
- `shared/specimen.mjs`: canonical settings, biological descriptions, simplified CAD anatomy schema and generation/image prompts.
- `shared/generation-choices.mjs` and `shared/generation-options.mjs`: browser-safe choice labels, validated controls and prompt version.
- `shared/visual-requirements.mjs`: canonical immutable original prompt plus required/excluded features.
- `shared/generation-review.mjs` and `shared/review-status.mjs`: advisory requirement-review schema/prompts and browser-safe status vocabulary.
- `shared/specimen-assets.mjs`: portrait versions, model asset vocabulary and CAD freshness rules.
- `shared/animal-types.mjs`: familiar animal inspiration groups, fictional flags, traits, habitats and simplified CAD leg suggestions; research references live in `docs/animal-inspiration.md`.
- `shared/encounter-directions.mjs`: camera viewpoints, ecological encounters, occluding compositions, biological silhouettes and challenges.
- `shared/generation-timing.mjs`: canonical job kinds, successful-generation timing rules, configurable rolling averaging and initial estimate.
- `shared/body-plans.mjs`: silhouette families and physical sampling ranges.
- `shared/anatomy-plan.mjs`: seeded biological/scene direction sampling, locks, preview validation, design-output validation and supported JSON-schema conversion.
- `server/index.mjs`: Express composition; `CRITTER_DIST_DIR` selects the static asset root for isolated checks.
- `server/specimen-routes.mjs`: validated plan/discovery/portrait/CAD routes and asset/trace downloads.
- `server/generation-jobs.mjs`: single-job lifecycle, image-first design, portrait versions and advisory review.
- `server/generation-trace.mjs`: durable exact inputs, model metadata, attempts and stage timing.
- `server/cad-stage.mjs`: current-image-based simplified CAD planning and build coordination.
- `server/codex.mjs`: Codex app-server boundary.
- `server/safe-error.mjs`: credential redaction for every user-visible or traced error string.
- `server/model-refusals.mjs`: shared model-reply parsing, evidence-based refusal classification, redacted excerpts and stage-specific recovery messages.
- `server/store.mjs`: SQLite and specimen-asset persistence.
- `server/portrait-assets.mjs` and `server/model-assets.mjs`: full image decoding/PNG normalization, preserved portrait versions and immutable CAD asset sets.
- `server/geometry.mjs`: solid geometry, STL, and OpenSCAD generation.
- `server/sculpt-head.mjs`: connected head, eyes, horns and antennae shared by the STL/SCAD recipe.
- `server/access.mjs` and `server/login.mjs`: optional public-host authentication.
- `shared/generation-models.mjs`: browser-safe provider vocabulary, default selection (Codex `gpt-6-astra` at `max`), configurable menu limiting/selection values, effort labels and stage→provider routing.
- `shared/generation-instructions.mjs`: the common generation instructions both providers receive.
- `server/model-catalog.mjs`: validated account model discovery for Codex and Claude, freshness/retry caching and selection validation.
- `server/claude.mjs` and `server/provider-cli.mjs`: restricted Claude subscription adapter (Agent SDK, structured output, reference images), executable resolution and environment allowlist.
- `server/settings-routes.mjs` and `server/generation-stats.mjs`: owner-only model/settings/statistics endpoints and pure historical aggregation.
- `src/theme.js`: dark-default theme (`critter-theme` in localStorage), Light/Dark radio-switch wiring, arrow-key navigation and theme-color mirrors.
- `src/settings-page.js` and `src/settings-format.js`: owner-only Settings page (one grouped model menu and effort selection, generation stats) and its duration/date/model formatting. The menu defaults to the first six newest models per provider plus the saved model, Codex ids, and Claude labels with resolved identities; the configurable hidden-effort set defaults to `ultra`. Catalogs retain raw efforts and filter them at read/selection-validation time.
- `scripts/check.mjs`: complete isolated suite (`npm run check`).
- `scripts/deploy.mjs`: invokes the hosting repo's Critter deployer with this source checkout; `npm run deploy` runs the complete suite first. `LIONFEATHER_EDGE_DIR` overrides the default sibling hosting checkout.
- `scripts/verify-http.mjs`: HTTP and binary-output checks against a running isolated server.
- `scripts/evaluate.mjs`, `server/evaluation-run.mjs`, `evals/image-generation.json`, and `shared/evaluation-metrics.mjs`: opt-in isolated live evaluations, manual scoring corpus and failure-inclusive summary metrics. The default command is an offline case listing; only explicit `--live` may consume the Codex allowance.
- `scripts/compare-browser.js`: browser_clean refactor oracle for desktop/phone DOM and computed styles.
- `tests/backend-layout.test.mjs`: focused gate for adapter direction, stable command targets and isolated-check boundaries. The generic backend-layout audit remains advisory because no layout baseline is written.

## Working agreements

- Run `npm run check` before committing. It runs every unit test, builds into a temporary directory, starts a server with a temporary data root and port, then runs HTTP and binary-download verification. It substitutes an offline Codex executable and checks that it was used; it must not use `.local`, Codex credentials, or live generation.
- `.local/critters.sqlite` and `.local/specimens/` are authoritative user data. Never use them in tests or replace them during deployment.
- Preserve `server/index.mjs`, port 4329, loopback binding, and asset/API routes as deployment contracts.
- Live generation is nondeterministic and is not a refactor oracle. Compare fixed specimen HTTP bodies, STL/SCAD bytes, DOM, and computed styles instead.
- Print heights are 60–500 mm, including the optional baseplate. Omitted `baseplate` settings default to enabled for older clients and saved recipes; never rewrite saved specimen assets to change this choice.
- Every new discovery creates biology and an image first, with `anatomy: null` and `print: null`. Deprecated `printModel` inputs remain validated but never trigger automatic CAD. Even the bundled example starts without CAD; startup never rewrites saved models. CAD is explicitly requested after a portrait exists, using that current image as a reference for a simplified interpretation. It may approximate biological structures/counts without rewriting biology.
- Portrait success increments `portraitVersion`, preserves prior PNGs and marks existing CAD stale. Failed image updates preserve the current version and CAD freshness. CAD records `sourcePortraitVersion` and immutable `assetRevision`; stale files remain downloadable with a warning/header. Legacy flat assets and the stable file routes remain supported.
- `visualRequirements` keeps the original user text and merges user-provided required/excluded features with extracted constraints. Explicit appearance requirements outrank sampled directions; accepted portrait edits override earlier appearance requirements only where they conflict. New portrait variants and edits retain specimen identity/biology.
- Browser intent is derived from the trimmed idea text: nonempty means `literal`, otherwise `invent`. Controls retain wildlife/reference/cutout composition, aspect ratio, and optional viewpoint, encounter and silhouette locks. A validated preview freezes the full plan; resampling ("New directions") preserves explicit choices, and changing inputs clears it. Literal intent avoids unrelated sampled anatomy. Reference/cutout modes remove forced habitat occlusion.
- Optional design/image reviews remain an advisory server capability (`review: true` in settings); the discovery form does not request them. Reviews distinguish satisfied, uncertain and conflicting requirements. Hidden anatomy is uncertain. They never certify visual correctness or automatically reject an otherwise saved image.
- Model refusals and safety blocks use evidence from provider replies/errors, never an absent image or exhausted structured-output retries alone. Failure messages describe retained assets and real controls: Retry portrait reuses stored settings; changed discovery inputs require a new specimen. Traces retain full replies, structured provider errors and image failure details; UI excerpts are redacted and bounded.
- Trace JSON under each job persists exact app prompts, schema, settings/plan, model/effort, every attempt, returned revised image prompt and stage timings. Unknown image-model identity stays unknown. `CRITTER_BUILD_REVISION` may identify a source revision; it is null when unspecified.
- Browser animal inspiration is optional and capped by app settings (default three selections). Selected groups are used exactly with `directionLocks.inspirations: true`; API/plan validation accepts any nonempty valid locked group set, independently of the browser cap; no selection sends `animalTypes: []` (all groups, sample 1–3) without the lock. Reusing settings restores only the first configured-cap animal groups and ignores saved `legless`, `review`, `intent` and inspiration-lock values. Legacy/API `legless` remains supported server-side and forces zero biological and CAD legs. Octopus arms, fins and tube feet are not paired walking legs.
- New jobs persist versioned inspiration, biological challenge and camera/encounter choices in `variation`. Portrait retries reuse the stored biology and scene choices. Full biology never inherits CAD proportions or an eight-leg restriction. Legacy head/stance multipliers default to 1 and horn sweep to 0.
- Wildlife image requests use habitat, diet, field observation, courtship and danger to build visible surrounding scenes. Biological images receive no numeric CAD proportions. Wildlife plans persist composition and biological silhouette choices and avoid immediately repeating an unlocked sampled camera viewpoint. Explicit locks may repeat.
- Generation defaults to Codex `gpt-6-astra` at `max` effort. The selection is stored under `app_metadata` key `generation-model`; each job snapshots its provider/model/effort in `job.generation` and traces record each stage's actual provider. Text stages (design, reviews, CAD planning) follow that selection; native image generation always uses Codex.
- Claude discovery is lazy and subscription-only. Tests inject fake queries or an unavailable executable (`CRITTER_CLAUDE_EXECUTABLE`); the isolated check marker disables Claude discovery. Never launch real provider binaries or read account credentials during checks.
- Owners can archive non-demo specimens (`DELETE /api/specimens/:id`, two-click Delete on collection cards). Archival moves the whole specimen folder to `<data>/archive/` before deleting its SQLite row, so startup never re-imports it; jobs and traces remain; the bundled example and the current job's specimen are refused (409). Public sessions expose their method in `/api/status.session`; `GET /logout` clears the app cookie and redirects to `/auth` on the public host or `/` locally. `POST /api/connect` reconnects Codex and the selected Claude provider. Known app paths (`/`, `/collection`, `/settings`, `/specimens/:id`) and `/index.html` serve `no-transform, no-cache`; unknown paths remain 404; hashed assets are immutable.
- Navigation links push browser history; initial canonicalization, denied Settings access, missing specimens and generation-driven selection replace it. Settings stays hidden until owner status is known; `/` shows the most recent specimen.
- On phones (≤750px) `.specimen-stage` is `display: contents` and the workspace children are ordered: controls, status, portrait, field notes, action cards, print files. Three.js is loaded with a dynamic import when the 3D tab opens; keep `viewer.js` out of static imports.
- Owner app settings persist under `app_metadata` key `app-settings`, merge older records over shared defaults, and apply through injected getters without restart. Defaults are five timing samples, six-minute cutoff, 130-second initial estimate, ten-minute provider turn timeout, three design attempts, three inspiration picks, six models/provider, hidden `ultra`, and fifteen-minute model freshness. Running turns and frozen job estimates keep their existing values. `GET`/`PUT /api/settings/app` return `{ values, efforts }`; `PUT` rejects hiding the saved generation effort. Status/connect expose only `{ maxAnimalInspirations, timingWindow }` in `config`.
- Model/settings/statistics endpoints require owner access. Without `PUBLIC_ORIGIN`, localhost is the owner; public deployments identify the owner by `CRITTER_OWNER_EMAIL` matched against the Access email sign-in (`owner` session method in `server/login.mjs`).
- Text uses rem sizes at a 16px baseline and `html{font-size:120%}` for a browser-relative 20% increase; `src/style.css` owns the app scale/tokens, mirrored by the script-free sign-in page.
- The theme is dark by default with a Light/Dark segmented radio switch (icons only at ≤600px, 44px touch targets); colors are OKLCH tokens in `src/style.css` driven by the hue/chroma knobs (same scheme as health-calendar). Theme logic lives in `src/theme.js`; there is no inline boot script because the CSP forbids it.
- `app_metadata` stores the successful full-generation timing aggregate, using the app-settings window and outlier cutoff (defaults: last five runs, excluding runs over six minutes), rebuilt from durable jobs on startup and immediately when timing settings change. Legacy completed jobs with a design thread count; failed/partial/interrupted/cancelled jobs, portrait updates and CAD jobs do not. Each new job freezes the preceding estimate in `estimatedDurationMs`; successful full jobs record `durationMs`. Status/connect expose `generationTiming`. Until samples exist, the configurable initial estimate defaults to 130 seconds; never let tests learn from real generation data.

- Decoded portraits accept PNG/JPEG/WebP up to 30 MiB encoded, 32 million pixels and 16,384 pixels per side; reject animation and malformed data, preserve alpha, and publish PNG. Prior portrait/CAD assets are never deleted to make a newer version current.
