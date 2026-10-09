# Critter Generator

A locally hosted fictional-creature studio: generated portraits, English and invented Latin names,
field notes, three personality sliders, and a rotatable 3D-printable sculpture.

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
The app was verified with CLI 0.154.0. It discovers available models, preferring `gpt-6-astra` when
available and otherwise the account's returned default. No global Codex configuration is changed.

## Use

1. Optionally describe a creature or choose a preset.
2. Adjust **Absurdity**, **Sexual deviancy**, and **Lethality** from 0–100.
   Sexual deviancy means unusual, non-graphic courtship and speculative reproductive biology.
3. Set the print height (60–180 mm) and click **Create a critter**.
4. Codex writes structured field notes and anatomy. The local geometry engine makes a closed solid,
   and Codex's native image-generation tool paints the portrait. Expect a few minutes.
5. Switch between **Portrait** and **3D print**. Drag the sculpture to rotate; scroll to zoom.
6. Download the portrait, field notes JSON, **STL**, or editable **OpenSCAD CAD source**.
7. Open **Collection** to revisit saved creatures. **Use these settings** copies a saved recipe's
   prompt and slider values into the form for a new variation.

One generation runs at a time. Closing/reloading the page does not cancel it. Cancel explicitly
with the progress card. If the image step fails, the completed notes and model remain saved;
**Retry portrait** retries only the artwork. Interrupted jobs are recorded after server restart.

## Local database and files

**`.local/critters.sqlite` is the authoritative database.** SQLite uses WAL mode.
The `specimens` table stores each creature's names, prose, anatomy, prompt, slider values, print
measurements, timestamps, and portrait state. `jobs` records generation progress and terminal status.
The first run includes a clearly labeled example sculpture. Generated specimens and artwork
stay local and are not included in the repository.

Assets are stored by specimen ID in `.local/specimens/<id>/`:

- `portrait.png`: actual generated artwork, if completed
- `model.stl`: binary triangle mesh in millimeters
- `model.scad`: editable constructive-solid-geometry source
- `mesh.json`: the same mesh used by the browser preview
- `record.json`: a human-readable metadata snapshot; the database remains authoritative

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

## 3D printing

The artwork and sculpture share a structured anatomy specification. **The sculpture is a simplified
interpretation, not a reconstruction of the image.** The model uses rounded body parts, legs, a single
head, eyes, horns, antennae, a tail, and dorsal plates. Image generation may vary proportions or details.

The server unions the actual surfaces with Manifold, verifies a single closed boundary, scales to the
requested height, and exports a flat display base with the creature. The browser previews that exact
STL geometry. STL has no intrinsic unit metadata; import using **millimeters**.
The sculpture has one material; STL does not include portrait colors or textures.

New generations favor squat, sturdy animals. The generation schema caps belly clearance at six
relative units, and the CAD builder additionally caps it at one quarter of the torso's vertical
semi-axis. Leg shafts grow with body width and use broad joints and feet. The boundary-case tests
check a nominal leg shaft diameter of at least 5 mm, including 60 mm-tall sculptures. These are
geometric design constraints, not a material-strength guarantee. Older saved models and portraits
remain as generated; the sturdier recipe applies when creating new model files.

Open the STL in your preferred slicer. Start with the flat base on the bed and supports enabled for
overhangs. Check the belly, muzzle, tail, and antennae in layer preview. Geometry has been validated;
no physical print or printer-specific slicing has been performed. Material, nozzle size, support
settings, and print orientation still determine physical results. This app does not emit G-code.

Open `model.scad` in OpenSCAD to modify the primitives or `target_height_mm`. The CAD source uses
the same primitive recipe but OpenSCAD's sphere tessellation can differ from the exported STL.

## Development and verification

```sh
cd /path/to/critter-generator
npm test
npm run build
npm run verify:http  # needs the local app running
npm audit
```

For frontend hot reload, keep `npm run serve` in one Terminal and `npm run dev` in another.
The development frontend at http://127.0.0.1:5173 proxies the backend at port 4329.
`PORT=4330 npm start` changes the production port (adjust the development proxy if using hot reload).

Tests verify STL edge closure and winding after binary serialization, requested dimensions,
16 extreme anatomy combinations, SQLite persistence/migration, malformed inputs, and Codex event
ownership/error handling. The HTTP check verifies actual asset downloads and local request boundaries.
Live browser verification covered generation, interruption, collection navigation, artwork loading,
3D rendering, responsive width at 390 px, and restart persistence.

### Implementation

- `server/codex.mjs`: the CLI's stdio app-server protocol, model discovery, constrained JSON,
  native image generation, cancellation, and timeout handling. Only app-created ephemeral threads
  are used. Shell, MCP connectors, browsing, and filesystem modification tools are disabled.
- `shared/specimen.mjs`: input/anatomy validation, output schema, and generation prompts.
- `server/geometry.mjs`: shared solid/SCAD recipe and binary STL writer; built in a worker thread.
- `server/store.mjs`: SQLite metadata and asset persistence.
- `server/index.mjs`: loopback-only Express server and generation lifecycle.
- `src/`: frontend and Three.js viewer, bundled locally with Vite.

The app follows the [official Codex app-server protocol](https://developers.openai.com/codex/app-server/),
uses [Manifold](https://manifoldcad.org/docs/jsuser/classes/Manifold.html) for solid geometry, and
[Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) for the print preview.
The installed CLI's generated protocol types were also inspected because the app-server evolves.
