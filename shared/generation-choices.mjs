import { viewpoints, encounters, biologicalSilhouettes } from './encounter-directions.mjs';

export const generationIntents = Object.freeze({ invent: 'Surprise me', literal: 'Follow my description' });
export const compositionModes = Object.freeze({ wildlife: 'Wildlife encounter', reference: 'Full-body reference', cutout: 'Transparent cutout' });
export const aspectRatios = Object.freeze(['1:1', '3:2', '2:3', '16:9', '9:16']);
// Trust-boundary limits keep user-supplied feature lists bounded in prompts and storage.
export const MAX_REQUIREMENT_COUNT = 20;
export const MAX_REQUIREMENT_LENGTH = 300;
export const DEFAULT_DIRECTION_LOCKS = Object.freeze({ viewpoint: null, encounter: null, silhouette: null, inspirations: false });

export const compositionDirections = Object.freeze({
  wildlife: 'An observed wildlife encounter in its concrete habitat.',
  reference: 'A complete, unobscured full-body reference view. Keep every appendage inside the frame and separately legible. Use a simple neutral background with no foreground objects covering the organism. Use even descriptive lighting.',
  cutout: 'One complete, unobscured organism isolated on a transparent background. Include the whole body and every appendage within the frame with clear empty margins. No habitat, ground plane, cast shadow, backdrop or foreground objects. Request true background transparency from the image tool.',
});

export const intentOptions = Object.entries(generationIntents).map(([id, label]) => ({ id, label }));
export const compositionModeOptions = Object.entries(compositionModes).map(([id, label]) => ({ id, label }));
export const aspectRatioOptions = aspectRatios.map(id => ({ id, label: id }));
export const directionOptions = Object.fromEntries(Object.entries({ viewpoint: viewpoints, encounter: encounters, silhouette: biologicalSilhouettes })
  .map(([kind, directions]) => [kind, Object.entries(directions).map(([id, description]) => ({
    id, label: id.charAt(0).toUpperCase() + id.slice(1), description,
  }))]));
