import { GENERATION_STAGES } from '../shared/generation-models.mjs';
import { z } from 'zod';
import { sculptValidation, SCULPT_LIMITS, SCULPT_GROUND } from '../shared/sculpt.mjs';
import { DEFAULT_APP_SETTINGS } from '../shared/app-settings.mjs';
import { PRINT_HEIGHT } from '../shared/print-settings.mjs';
import { portraitVersionOf } from '../shared/specimen-assets.mjs';
import { reviewCad } from './cad-review.mjs';
import { buildCadCandidate } from './cad-candidate.mjs';

export const CadRequest = z.object({
  height: z.number().int().min(PRINT_HEIGHT.min).max(PRINT_HEIGHT.max).default(PRINT_HEIGHT.initial),
  baseplate: z.boolean().default(true),
}).strict();

export function cadDesignPrompt(specimen) {
  return `Compose a printable sculpture of the attached current portrait from primitives. Return only Sculpt JSON.
The portrait is the visual authority: reproduce silhouette, topology, posture, proportions and appendage counts.
Radial bodies stay radial; discs stay discs. Do not substitute a conventional torso and four legs. Do not redesign biology.
Organism description (reference data): ${specimen.description}
Biology (reference data): ${JSON.stringify(specimen.biology ?? {})}
Frame: x right, y back (head/front toward -y), z up. Ground/base top is z=${SCULPT_GROUND}.
Use roughly 30–80 units of creature height. Coordinates are within ±${SCULPT_LIMITS.coordinate}; radii are 0.1–${SCULPT_LIMITS.radius}.
Parts: ellipsoid uses center and radii (semi-axes), with optional rotation [x,y,z] in degrees, applied X then Y then Z.
Capsule uses from/to endpoints and radius/endRadius; it is the convex hull of two balls, not a cylinder.
Hull uses balls (2–${SCULPT_LIMITS.balls} objects with center and radius); use these for fins, plates, wings, vanes or rim segments.
Set fields unused by a kind to null. Label each part's role body, walking-leg or detail. Use hex color/accent; accent:true selects the accent color.
mirrorX:true makes the seed and its reflection across x=0. radial:{count,axis,center} makes count equally spaced copies,
including the seed, around x, y or z through center; mirror happens first, then radial rotation. No repeat means radial:null.
At most ${SCULPT_LIMITS.parts} raw parts and ${SCULPT_LIMITS.expandedParts} expanded parts; radial count is 2–${SCULPT_LIMITS.repeats}.
Primitives must substantially overlap their neighbors: touching at a point is not enough. One connected solid is required.
Place the lowest feet, rim or belly crossing z=${SCULPT_GROUND} for ground contact. Do not model the base yourself.
The server thickens features below the print minimum, adds the requested base or trims to the ground, and scales to print height.
Preserve visible holes and separations where possible; do not fill the whole silhouette with a blob to connect it.
${specimen.biology?.legCount === 0 || specimen.settings?.legless ? 'This organism is legless: no walking-leg parts are allowed.' : 'Match the visible walking-leg count, without an eight-leg template limit.'}
Arms, fins and tentacles are not walking legs. List only specific unavoidable differences in approximationNotes; use [] if none.
No tools are needed.`;
}

export async function generateCad({ specimen, request, store, providers, trace, signal, update, settings = DEFAULT_APP_SETTINGS }) {
  const sourcePortraitVersion = portraitVersionOf(specimen);
  const validation = sculptValidation(specimen.biology?.legCount === 0 || specimen.settings?.legless);
  update({ stage: GENERATION_STAGES.CAD_DESIGN, message: 'Planning a sculpture from the current portrait…' });
  const context = { prompt: cadDesignPrompt(specimen), imagePaths: [store.portraitFile(specimen)],
    validation, repairAttempts: settings.cadRepairAttempts, rounds: settings.cadReviewRounds, request, store, providers, trace, signal, update };
  const initial = await buildCadCandidate(context);
  const candidate = await reviewCad(initial, context);
  signal.throwIfAborted();
  const print = await trace.operation('cad-publish', { sourcePortraitVersion }, () => store.model(specimen.id,
    candidate.sculpt, request.height, request.baseplate, { sourcePortraitVersion, result: candidate.result }));
  signal.throwIfAborted();
  return { ...specimen, sculpt: candidate.sculpt, print: { ...print, approximationNotes: candidate.sculpt.approximationNotes } };
}
