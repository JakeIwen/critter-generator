# Critter Generator

A locally hosted speculative-animal studio: wildlife images in their environments, English and
invented Latin names, field notes, animal inspiration chips, five personality sliders, portrait edits and on-demand CAD.

## Screenshots

| Creature studio | Saved collection |
|---|---|
| ![Creature controls, generated portrait, and field notes](docs/screenshots/studio.png) | ![Saved fictional creatures](docs/screenshots/collection.png) |

The studio shows the bundled fictional example after an explicit CAD request. The collection also
contains an offline test specimen. These isolated-fixture captures demonstrate controls and layout;
their generation-time estimate is not a live-model performance measurement.

![Six sampled silhouettes shown with the same material at 100 mm](docs/screenshots/diversity.png)

These six CAD recipe examples use the same sculpture material, so their differences come from geometry. New sculptures are requested after a portrait exists and are planned from that portrait.

## Run

```sh
git clone https://github.com/JakeIwen/critter-generator.git
cd critter-generator
npm ci
npm start
```

Open **http://127.0.0.1:4329**. Node 22.13+ and the installed `codex` CLI are required.
`npm start` builds the frontend and runs the server in the foreground. Keep that Terminal open.
To stop the current app instance from a second Terminal:

```sh
cd /path/to/critter-generator
npm run stop
```

The app reuses your local Codex ChatGPT login.
It does not use or copy an API key. Generation uses the account's Codex allowance and requires internet.
Saved specimens, artwork, and models remain available offline. Check sign-in with:

```sh
codex --version
codex login status
```

If signed out, run `codex login`, complete its sign-in instructions, then click the connection indicator.
The reference-image protocol was checked against CLI 0.163.0. It discovers available models, preferring `gpt-6-astra` when
available and otherwise the account's returned default. No global Codex configuration is changed.

## Use

The interface starts dark regardless of system appearance. The sun/moon button in the top bar
switches themes and remembers the choice when browser storage is available.

1. Describe the lifeform or start from a preset. A nonempty description is followed directly; leave it
   blank for speculative invention. Presets fill the description and personality sliders.
2. Open **Requirements & direction controls**, then **Animal inspiration**, to optionally choose up to
   the configured maximum (three groups by default). Every selected group is used together. **Any animal** clears the selection and
   restores automatic sampling.
3. Adjust **Absurdity**, **Sexual deviancy**, **Femme**, **Psychedelic**, and **Lethality**. The reproductive
   setting is clinical zoological biology; Femme means ornament and poise, never sexualization.
4. Choose a wildlife encounter, full-body reference, or transparent cutout and an aspect ratio.
   Optional **Must include** and **Must exclude** lists carry visual constraints through both stages.
   Optionally lock the camera, activity and body outline. **Preview directions** shows the sampled
   plan; **New directions** resamples while preserving explicit choices. Changing settings clears the
   preview; submitting an unchanged preview uses that exact plan.
5. Click **Generate lifeform**. Codex writes the organism and field notes, then generates its portrait.
   This step never creates CAD, including when an older client sends `printModel: true`.
   By default, the loader estimates time from the latest five successful complete discoveries, excluding runs
   longer than six minutes, with a 130-second initial fallback; all three values are editable in Settings. Its percentage is an elapsed-time estimate, not measured model completion.
6. Use **Another portrait** for a new image of the same species, or **Edit this portrait** for a targeted
   change using the current image as reference. Earlier versions remain downloadable. Accepted visual
   edits take precedence over original appearance text in later portraits; the biological record stays
   intact. The server's advisory review (satisfied, uncertain or conflicting requirements, with hidden
   anatomy reported as uncertain) is no longer requested by the form; it never rejects an image or
   certifies correctness.
7. After an image exists, use **Generate CAD** and choose height (60–500 mm) and a baseplate. The server
   plans a simplified sculpture from the current portrait. Download STL/OpenSCAD and inspect the exact
   geometry in the 3D tab. A successful new portrait or edit marks existing CAD **Out of date**; its
   downloads remain available until you request another sculpture. A failed image update leaves the
   previous portrait and CAD freshness intact.
8. Open **Collection** to revisit saved animals. The owner also sees **Delete** on each card: a second
   click within five seconds archives the specimen (its folder moves to `<data>/archive/` and its row
   is removed; jobs and traces stay). The bundled example and a specimen with a running job cannot be
   archived. On phones the field notes follow the portrait directly, with the portrait/CAD cards after
   them, and the 3D viewer's library loads only when the 3D tab opens. **New lifeform from settings** restores the input
   controls for another discovery; it is a different action from editing an existing portrait.
   Download field notes and the generation trace to inspect the exact inputs and attempts.

One job runs at a time. Reloading does not cancel it. Cancel with the progress card. If the first
portrait fails, the organism is saved and **Retry portrait** paints it without repeating design.
Interrupted jobs are recorded after restart. CAD and portrait updates do not enter the discovery-time
average; CAD progress does not borrow an unrelated image-generation percentage.

The 16 real animal groups and two fictional bonuses are cataloged in
[Animal inspiration groups](docs/animal-inspiration.md). Wildlife mode uses field observations,
food, threats and habitat as visible scene evidence, with varied cameras and foreground occlusion.
Reference and cutout modes replace that scene requirement with an unobscured subject. Explicit visual
requirements outrank sampled directions. Image models can still miss details; inspect portraits and use
targeted edits when exact appearance matters.

The saved `variation` contains the complete versioned plan and seed. A seed alone does not recreate a
production request because recent collection history influences sampling; the trace retains the frozen
plan and actual prompts. CAD proportions never constrain the initial biological design or portrait.

### Settings

The owner-only **Settings** page (the Settings tab appears for the owner; localhost is always the
owner) selects a model from one menu grouped by provider (Codex first, then Claude), plus its supported
reasoning effort for new jobs. Each group shows the configured number of newest models returned by that provider (six by default),
plus the saved model if it falls outside that limit. Codex rows show only the model id (for example,
`gpt-6-astra`); Claude rows show the label and resolved identity (for example,
`Default · claude-opus-5-5[1m]`). Default models are marked `(default)` unless the Claude label already
says `Default`; the `(recommended)` suffix is removed. Efforts checked under **Hidden efforts** are neither offered nor
accepted; `ultra` is hidden by default. The default selection is Codex / gpt-6-astra / Maximum.

Save applies the selection to the next job; portraits always use Codex image generation. Refresh
models rediscovers the models available to the host's signed-in subscription accounts (cached for
15 minutes by default, configurable). Unavailable providers keep their group with a disabled reason option and a note below
the control. An unavailable account or model fails a job with a clear message rather than silently
switching.

The **App settings** card saves host-wide preferences without a restart. Hover a field label for its
help text. **Reset to defaults** only fills the form; **Save** persists it. Settings use one definition
table (`shared/app-settings.mjs`) and live in SQLite's `app_metadata`, not browser storage.

| Setting | Default | Allowed range |
|---|---|---|
| Successful runs to average | 5 runs | 1–20 |
| Ignore runs longer than | 6 minutes | 1–60 minutes |
| Initial estimate | 130 seconds | 10–1800 seconds |
| Model turn timeout, both providers | 10 minutes | 1–60 minutes |
| Design attempts after runaway output | 3 attempts | 1–5 |
| Animal inspiration limit | 3 groups | 1–all animal groups (currently 18) |
| Models per provider | 6 models | 1–30 |
| Hidden efforts | `ultra` | Checkboxes from raw discovery plus saved hidden values |
| Model list freshness | 15 minutes | 1–1440 minutes |

Timing changes immediately rebuild the estimate from durable jobs; existing jobs keep their frozen
estimate. New provider turns use the new timeout. Lowering the inspiration limit trims the current
form selection, without limiting valid API clients. Model-menu and effort changes apply to cached
models without rediscovery. Hiding the saved generation effort is rejected: save a different model
selection/effort first. Fixed security, trust-boundary, CAD and protocol limits remain in code.

Owners can `GET`/`PUT /api/settings/app`; PUT accepts the full values object and both return
`{ values, efforts }`. Public `/api/status` and `/api/connect` expose only
`config: { maxAnimalInspirations, timingWindow }` from these preferences.

Generation stats show the timing estimate and excluded outliers, job totals by kind and status,
completed-job durations, the ten newest jobs and results grouped by model.

## Local database and files

**`.local/critters.sqlite` is the authoritative database.** SQLite uses WAL mode.
The `specimens` table stores each animal's names, prose, biology, optional CAD anatomy, settings, print
measurements, timestamps, and portrait state. `jobs` records generation progress and terminal status.
Completed full jobs record `durationMs`; `app_metadata` stores the rolling timing aggregate. Eligible
older jobs contribute from their saved start/finish timestamps without rewriting their records.
Failed, cancelled, interrupted, partial and portrait-retry jobs are excluded. Each new job keeps the
estimate it started with, including after a page reload, even when the global average changes.
The first run includes a clearly labeled example portrait. It does not build an example sculpture at startup. Generated specimens and artwork
stay local and are not included in the repository.

Assets are stored by specimen ID in `.local/specimens/<id>/`:

- `portrait.png`: compatibility copy of the current decoded, normalized PNG
- `portraits/<version>.png`: preserved original and subsequent portrait versions
- `models/<assetRevision>/model.stl`, `model.scad`, `mesh.json`: immutable CAD asset sets
- `record.json`: human-readable snapshot; SQLite remains authoritative

Older flat `model.stl`, `model.scad`, `mesh.json` and unversioned `portrait.png` remain readable.
The stable asset routes resolve either layout. New organisms begin with `anatomy: null`, `print: null`;
CAD files are absent and their routes return 404 until explicitly requested. CAD metadata records its
`sourcePortraitVersion`, geometry recipe version, print measurements and approximation notes. Out-of-date CAD
remains downloadable with an `X-Critter-Cad-Stale: true` response header. Biological leg counts can exceed
the simplified sculpture's zero-to-four walking-leg-pair range.

`.local/jobs/<jobId>/trace.json` records exact application-sent prompts, output schemas, settings,
frozen plan, model/effort, each attempt, returned revised image prompts and stage durations. It never
stores account credentials or image base64. An unknown underlying image-model version is recorded as
unknown rather than inferred from the orchestration model. Traces include failed jobs before a specimen
exists and can be exported through `/api/jobs/<jobId>/trace` or a specimen's latest trace link.
Set `CRITTER_BUILD_REVISION` during a build/deploy to record a known source revision; absent values stay null.

Everything under `.local/` is ignored by Git. No OpenAI account credentials are stored there.
The temporary `server.json` includes an instance-specific token used only by the local stop command.
The app imports any earlier file-based specimen records without replacing records already in SQLite.

Git also ignores environment files (except a placeholder-only `.env.example`), local credential
files, private keys, logs, database copies, backups, and agent notes. Keep credentials outside
the repository and review staged files before publishing; ignore rules do not inspect file contents.

For a complete backup, stop the app and copy **all** of `.local/`, not just the SQLite file:

```sh
cd /path/to/critter-generator
npm run stop
tar -czf "../critter-generator-backup-$(date +%Y%m%d-%H%M%S).tar.gz" .local
npm start
```

## Hosting behind Cloudflare Access

The server still binds only `127.0.0.1`. To serve it through a Cloudflare Tunnel, set:

- `PUBLIC_ORIGIN`: the public URL, e.g. `https://critter.lionfeather.dev`
- `ACCESS_TEAM_DOMAIN`: e.g. `<team>.cloudflareaccess.com`
- `ACCESS_AUD`: the audience tag of the Access application that guards `/auth/email`
- `CRITTER_PASSCODE` (optional): a shared passcode that also signs visitors in
- `CRITTER_OWNER_EMAIL` (optional): the Access email whose `/auth/email` sign-in unlocks the
  owner-only Settings page (model/effort selection and generation stats). Matching ignores case and
  surrounding whitespace; passcode sign-ins and other emails stay ordinary sessions. Existing
  sessions are not upgraded: sign in again through `/auth/email` after configuring it. Localhost
  is always the owner.
- `CRITTER_DATA_DIR` (optional): data directory instead of `.local/`

Requests for the public host need a session cookie, which `/auth` issues in one of two ways:

- **Passcode:** the form at `/auth` checks `CRITTER_PASSCODE`. Ten wrong tries from one address
  (or 100 overall) in 15 minutes lock the form for 15 minutes. Changing the passcode signs out
  everyone who used it.
- **Email:** `/auth/email` is the only path Cloudflare Access guards, with its emailed one-time
  code. The server checks the `Cf-Access-Jwt-Assertion` signature against the team's published
  keys, plus issuer, audience, and expiry, before issuing the session.

Sessions last 7 days and are signed with a key kept in the data directory (`session-secret`).
`/api/status` reports the current `session` (`owner`, `email`, `passcode` or null) and the top bar
shows **Log out** on the public host, which clears the app cookie and returns to `/auth`. **Retry**
on the connection pill reconnects Codex and, when selected, Claude. The index page is served with
`Cache-Control: no-cache` so a deploy is picked up on the next load; hashed assets are immutable.
Access must bypass the rest of the host; otherwise the passcode can never be reached. Localhost
requests work as before. Everyone signed in shares one collection and the host's Codex login.
The lionfeather.dev deployment lives in the `lionfeather-edge` repository (`apps/critter/`).

From this checkout, deploy an update with:

```sh
npm run deploy
```

This runs the complete isolated check suite, then calls the existing deployer in the sibling
`../lionfeather-edge` checkout with this checkout as its source. Set `LIONFEATHER_EDGE_DIR` if the
hosting repo lives elsewhere. The deployer copies the working tree, installs dependencies and builds
on the server, restarts `critter.service`, and checks its status endpoint. It excludes local data,
credentials and dependencies from the transfer; server specimens remain in `/var/lib/critter/data`.
Review uncommitted changes before deploying because they are included.

## 3D printing

The artwork follows the full biological description and visual requirements. **CAD is generated only
after you request it for an existing portrait.** It is a simplified interpretation of that current image.
The recipe uses rounded body parts, legs, a single head, eyes, horns, antennae, a tail and dorsal plates.
Fine membranes, wings, fins, tentacles and other structures may be omitted or approximated; each new
sculpture lists its specific approximation notes. CAD planning never rewrites the organism's biology.

The server unions the actual surfaces with Manifold, verifies a single closed boundary, scales to the
requested height, and optionally includes a flat display base with the creature. The browser previews that exact
STL geometry. STL has no intrinsic unit metadata; import using **millimeters**.
The sculpture has one material; STL does not include portrait colors or textures.

New models follow FDM conventions for a sturdy figurine (`PRINT_RULES` in `server/geometry.mjs`),
enforced in printed millimeters so they hold at every height:

- No horn, antenna or tail segment thinner than 3 mm. The print scale is solved first, then thin
  features are thickened to suit it.
- When enabled, a base slab at least 3 mm thick, with a 0.8 mm bottom chamfer against first-layer squish.
- Tails of 10+ relative units sweep down onto a small pad, rather than cantilevering.
  The base becomes the hull of its disc and the pad, so the footprint stays compact.
- The model info reports the thinnest feature, base thickness, the share of surface that overhangs
  more than 45° (support needed), and whether the center of mass sits over the middle of the base.

CAD planning varies body and head proportions within the supported sculpture recipe while retaining sturdy legs when present. The print schema caps belly clearance at six
relative units, and the CAD builder additionally caps it at one quarter of the torso's vertical
semi-axis. Leg shafts grow with body width and use broad joints and feet. The boundary-case tests
check a nominal leg shaft diameter of at least 5 mm, including 60 mm-tall sculptures. These are
geometric design constraints, not a material-strength guarantee. Older saved models and portraits
remain as generated; the current recipe applies only when the user requests new model files. Startup does not regenerate saved CAD.

Uncheck **Include baseplate** to export the creature alone; the exported model is grounded at Z=0.
The chosen height includes the baseplate when enabled. Existing saved models keep their original files.

Open the STL in your preferred slicer. Print upright with the baseplate or feet on the bed and tree or
organic supports for the belly, chin and eyes. Check those areas in layer preview. Geometry has been validated;
no physical print or printer-specific slicing has been performed. Material, nozzle size, support
settings, and print orientation still determine physical results. This app does not emit G-code.

Open `model.scad` in OpenSCAD to modify the primitives or `target_height_mm`. The CAD source uses
the same faceted sphere geometry, primitive recipe, and bed-contact clipping as the exported STL.

## Development and verification

```sh
cd /path/to/critter-generator
npm run check
npm audit
```

`npm run check` runs the unit tests, a scratch production build, and HTTP/binary-download
verification against a self-started server with temporary data. It does not use `.local`, Codex
credentials, live generation, or the normal port. `npm run verify:http` remains available when
checking an already running instance explicitly.

For frontend hot reload, keep `npm run serve` in one Terminal and `npm run dev` in another.
The development frontend at http://127.0.0.1:5173 proxies the backend at port 4329.
`PORT=4330 npm start` changes the production port (adjust the development proxy if using hot reload).

Tests verify STL edge closure and winding after binary serialization, requested dimensions,
extreme anatomy combinations, locked/replayed plans and 48 varied CAD recipe exports, SQLite persistence/migration, malformed inputs, and Codex event
ownership/error handling. The HTTP check verifies actual asset downloads and local request boundaries.
An isolated Codex protocol fixture checks image-first discovery, on-demand CAD from reference images,
portrait versions, edits, stale-model downloads, trace attempts and advisory review without contacting a model or reading credentials.
Browser verification uses an isolated fixture-backed server at desktop and phone widths; live model
quality is evaluated separately from deterministic regression checks.

### Image evaluations

`npm run evaluate` lists the separate evaluation corpus offline. It makes no Codex calls. Live
runs require an explicit flag and consume the same Codex ChatGPT allowance as normal generation:

```sh
npm run evaluate -- --live --case cat-invent --repeat 2
```

Use `--case targeted-edit` to include its source portrait and an identity-preserving edit. Use `--out`
to choose a parent output folder; each run creates its own isolated directory. The runner rejects
`.local`, the configured authoritative data root, and symlinks leading into either. It keeps a fixed
empty-history plan for each case and repeat, original output images, exact traces, manifest, and manual
score template. No evaluation runs are part of `npm run check`.

Fill in `scores.json` manually: satisfied, conflict, uncertain or unscorable for each criterion, plus
an optional separate appearance rating. Summarize saved results with the runner's `--summarize` and
`--scores` options. Metrics include failures/partials/cancellations/interruptions, median and p90 time,
stage durations and retry counts. Missing quality scores remain unknown. See
[Evaluation workflow](docs/image-evaluations.md) for complete commands and interpretation.

### Implementation

- `server/codex.mjs`: the CLI's stdio app-server protocol, model discovery, constrained JSON,
  native image generation, cancellation, and timeout handling. Only app-created ephemeral threads
  are used. Shell, MCP connectors, browsing, and filesystem modification tools are disabled.
- `shared/sliders.mjs`: the personality sliders (ids, labels, defaults), shared by server and browser.
- `shared/specimen.mjs`: input/anatomy validation, output schema, and generation prompts.
- `server/geometry.mjs`: shared solid/SCAD recipe and binary STL writer; built in a worker thread.
- `server/store.mjs`: SQLite metadata and asset persistence.
- `server/index.mjs`: loopback-only Express composition; `server/generation-jobs.mjs` owns the job lifecycle.
- `server/specimen-routes.mjs`: plan, discovery, portrait, CAD, versioned download and trace routes.
- `server/generation-trace.mjs`: durable per-attempt traces; `server/cad-stage.mjs`: image-based CAD planning.
- `server/portrait-assets.mjs`, `server/model-assets.mjs`: decoded PNG publication and immutable CAD asset sets.
- `shared/generation-choices.mjs`, `shared/generation-options.mjs`: browser choices and validated controls.
- `shared/visual-requirements.mjs`, `shared/generation-review.mjs`: canonical requirements and advisory review.
- `shared/specimen-assets.mjs`: portrait versions, asset names and CAD freshness rules.
- `server/evaluation-run.mjs`: isolated live evaluation coordination behind the thin `scripts/evaluate.mjs` CLI.
- `server/access.mjs`: Cloudflare Access token verification for optional public hosting.
- `server/login.mjs`: public-host sign-in (passcode or Access email), session cookies, and lockout.
- `src/`: frontend and Three.js viewer, bundled locally with Vite.

`server/index.mjs` is the stable deployed process entry. It composes the Codex,
SQLite, geometry and authentication adapters in `server/`; schemas and prompt
rules shared with the browser remain in `shared/`. The external check, HTTP
verification and stop commands are listed in the Contracts table in `AGENTS.md`.
- `src/main.js`: frontend bootstrap; `src/studio.js` owns the laboratory, collection, specimen,
  and generation-job interactions; `src/viewer.js` owns the Three.js preview.

The app follows the [official Codex app-server protocol](https://developers.openai.com/codex/app-server/),
uses [Manifold](https://manifoldcad.org/docs/jsuser/classes/Manifold.html) for solid geometry, and
[Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) for the print preview.
The installed CLI's generated protocol types were also inspected because the app-server evolves.
