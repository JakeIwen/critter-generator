# Image evaluations

The live corpus measures image-generation behavior separately from the deterministic regression
suite. `npm run evaluate` defaults to an offline list and does not connect to Codex. The eight cases
cover invention, literal intent, explicit counts/exclusions, legless organisms, an unobscured reference,
a transparent cutout, portrait framing and a targeted edit.

## Run a case

```sh
npm run evaluate -- --case tidal-cat
npm run evaluate -- --live --case tidal-cat --repeat 2
npm run evaluate -- --live --case targeted-edit --out /tmp/critter-evals
```

The first command lists the selected criteria offline. The latter commands explicitly spend the
existing Codex ChatGPT allowance. Repeat count is 1–10. Editing automatically includes its source case.
The output path is printed before generation starts. It is a new private directory, with its own
SQLite data and workspace, never the real collection. Protected data roots and symlinks into them
are rejected. New evaluation runs do not mutate saved specimens or their timing estimates.

Each case freezes settings, full variation and an empty-history seed in `plans.json`; repeats use
that same plan. This tests model variation separately from history-driven sampling. It does not make
model output deterministic. `corpus.json` retains the selected case definitions. The incremental
`manifest.json` records completed and not-run cases, outcome, stage timing, attempts and paths.
Images, specimen snapshots and exact generation traces are in `artifacts/`.

## Score and summarize

Open the generated images and edit the run's `scores.json`. Leave unreviewed values null. For each
criterion use:

| Value | Meaning |
|---|---|
| `satisfied` | The visible evidence meets the requirement. |
| `conflict` | The visible evidence contradicts the requirement. |
| `uncertain` | The result is ambiguous or the evaluator cannot decide. |
| `unscorable` | The image does not expose enough evidence, such as hidden appendages. |

Appearance is a separate subjective 1–5 rating. A visually appealing result can still violate an
explicit request. Conversely, a hidden leg is not proof of a missing or extra leg. Advisory model
review is useful evidence to inspect, not a substitute for an independent score.

Use the printed manifest/score paths with these options (substitute the actual run directory):

```sh
node scripts/evaluate.mjs --summarize /tmp/run/manifest.json
```

For a command with both paths, use the same options plus `--scores /tmp/run/scores.json`.
The report includes all terminal outcomes in the completion rate, median/p90 end-to-end and stage
durations, Codex-call/retry counts, manual constraint findings and the independent appearance summary.
It does not invent a quality pass rate when scores are absent. The nearest-rank p90 is descriptive;
with few samples it is usually just the slowest run.

## Compare responsibly

Use separate questions for request fidelity and speculative invention. Give both systems the same
initial requests, retain every attempt, and define criteria before examining the results. A second
experiment using a shared frozen organism description can help isolate planning from rendering.
Verify the actual image models before attributing a difference to model quality. Unknown versions,
account personalization and hidden custom GPT instructions remain possible confounders.

A generation trace records the app's emitted prompt and any returned revised image prompt; it does
not expose the image model's hidden instructions. Failed and interrupted attempts matter even when
a later retry succeeds. Keep nondeterministic quality judgments out of the normal offline suite.
