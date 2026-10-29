import { z } from 'zod';
import { viewpoints, encounters, biologicalSilhouettes } from './encounter-directions.mjs';
import { generationIntents, compositionModes, aspectRatios, DEFAULT_DIRECTION_LOCKS } from './generation-choices.mjs';
import { InputVisualFeatures } from './visual-requirements.mjs';
export * from './generation-choices.mjs';

export const DirectionLocks = z.object({
  viewpoint: z.enum(Object.keys(viewpoints)).nullable().default(null),
  encounter: z.enum(Object.keys(encounters)).nullable().default(null),
  silhouette: z.enum(Object.keys(biologicalSilhouettes)).nullable().default(null),
  inspirations: z.boolean().default(false),
}).strict();

export const generationOptionFields = {
  intent: z.enum(Object.keys(generationIntents)).default('invent'),
  compositionMode: z.enum(Object.keys(compositionModes)).default('wildlife'),
  aspectRatio: z.enum(aspectRatios).default('1:1'),
  directionLocks: DirectionLocks.default({ ...DEFAULT_DIRECTION_LOCKS }),
  requiredFeatures: InputVisualFeatures.default([]),
  excludedFeatures: InputVisualFeatures.default([]),
  review: z.boolean().default(false),
};

// Prompt versions identify the template used by saved jobs and traces.
export const GENERATION_PROMPT_VERSION = 4;
