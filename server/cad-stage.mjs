import { GENERATION_STAGES } from '../shared/generation-models.mjs';
import { z } from 'zod';
import { GenerationAnatomy } from '../shared/specimen.mjs';
import { PRINT_HEIGHT } from '../shared/print-settings.mjs';
import { portraitVersionOf } from '../shared/specimen-assets.mjs';
import { generationOutputSchema } from '../shared/anatomy-plan.mjs';

export const CadRequest = z.object({
  height: z.number().int().min(PRINT_HEIGHT.min).max(PRINT_HEIGHT.max).default(PRINT_HEIGHT.initial),
  baseplate: z.boolean().default(true),
}).strict();
const CadDesign = z.object({ anatomy: GenerationAnatomy,
  approximationNotes: z.array(z.string().min(3).max(350)).min(1).max(8) }).strict();

export function cadDesignPrompt(specimen) {
  return `Plan a sturdy, simplified printable interpretation of the attached current animal portrait.
Return only the requested JSON. The image is the visual authority for this sculpture; keep its recognizable body,
head, posture and major appendages as closely as this constrained recipe allows. Do not redesign the biological record.
Organism description: ${specimen.description}
Full biology (may exceed the sculpt's capabilities): ${JSON.stringify(specimen.biology ?? {})}
The recipe supports one ellipsoid torso, one proportioned head, 0–4 pairs of stout walking legs, 1–6 eyes,
horns, a tail, short antennae and dorsal plates. Fins, wings, tentacles, fine membranes and colonial forms may
need to be omitted or approximated; list specific differences in approximationNotes, not generic disclaimers.
Choose zero walking legs for legless organisms. Arms, fins and tentacles are not paired walking legs.
The animal's actual biological leg count may exceed eight; choose a representative printable approximation
without changing the biological description or claiming it exactly reproduces the source image.
Body dimensions are semi-axes; legLength is belly clearance 0–6 and should be no more than bodyHeight / 4.
headWidth/headDepth/headHeight are head-axis multipliers, stanceWidth controls leg spread, and hornSweep
points forward at -1 and back at +1. Use hex colors. No tools are needed.`;
}

export async function generateCad({ specimen, request, store, providers, trace, signal, update }) {
  const sourcePortraitVersion = portraitVersionOf(specimen);
  const validation = specimen.biology?.legCount === 0 ? CadDesign.extend({ anatomy:
    GenerationAnatomy.extend({ legPairs: z.literal(0), legLength: z.literal(0) }) }) : CadDesign;
  update({ stage: GENERATION_STAGES.CAD_DESIGN, message: 'Planning a simplified sculpture from the current portrait…' });
  const generated = await trace.run(providers, GENERATION_STAGES.CAD_DESIGN, { prompt: cadDesignPrompt(specimen), schema: generationOutputSchema(validation),
    imagePaths: [store.portraitFile(specimen)], signal });
  const design = validation.parse(JSON.parse(generated.text));
  signal.throwIfAborted();
  update({ stage: 'model', message: 'Building and checking the printable solid…' });
  const print = await trace.operation('cad-build', { anatomy: design.anatomy, ...request, sourcePortraitVersion },
    () => store.model(specimen.id, design.anatomy, request.height, request.baseplate, { sourcePortraitVersion }));
  signal.throwIfAborted();
  return { ...specimen, anatomy: design.anatomy, print: { ...print, approximationNotes: design.approximationNotes } };
}
