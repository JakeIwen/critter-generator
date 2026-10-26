import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisualRequirements, visualRequirementsFor, VisualRequirements, visualRequirementsDirection } from '../shared/visual-requirements.mjs';
import { intentOptions, compositionModeOptions, aspectRatioOptions, directionOptions } from '../shared/generation-options.mjs';
import { viewpoints, encounters, biologicalSilhouettes } from '../shared/encounter-directions.mjs';

test('visual requirements retain immutable input and merge extracted requirements without duplicates', () => {
  const settings = { prompt: 'A four-legged cat, no wings.', requiredFeatures: ['black fur'], excludedFeatures: ['horns'] };
  const extracted = { originalPrompt: 'wrong source', required: ['black fur', 'four legs'], excluded: ['wings', 'horns'] };
  const requirements = createVisualRequirements(settings, extracted);
  assert.deepEqual(requirements, { originalPrompt: settings.prompt, required: ['black fur', 'four legs'], excluded: ['horns', 'wings'] });
  assert.deepEqual(VisualRequirements.parse(requirements), requirements);
  assert.deepEqual(visualRequirementsFor({ settings, visualRequirements: extracted }), requirements);
  assert.equal(extracted.originalPrompt, 'wrong source', 'Merging must not mutate a saved record');
  const prompt = visualRequirementsDirection(requirements);
  assert(prompt.includes(settings.prompt)); assert(prompt.includes('four legs')); assert(prompt.includes('horns'));
});

test('legacy specimens retain their original text and records without settings retain saved requirements', () => {
  assert.deepEqual(visualRequirementsFor({ settings: { prompt: 'A purple worm.' } }),
    { originalPrompt: 'A purple worm.', required: [], excluded: [] });
  const visualRequirements = { originalPrompt: 'A small bird.', required: ['two wings'], excluded: [] };
  assert.deepEqual(visualRequirementsFor({ visualRequirements }), visualRequirements);
  assert.deepEqual(visualRequirementsFor({}), { originalPrompt: '', required: [], excluded: [] });
  assert.throws(() => createVisualRequirements({ prompt: 'x'.repeat(1001) }));
});

test('browser option vocabularies cover their canonical server choice maps', () => {
  assert.deepEqual(intentOptions.map(option => option.id), ['invent', 'literal']);
  assert.deepEqual(compositionModeOptions.map(option => option.id), ['wildlife', 'reference', 'cutout']);
  assert.deepEqual(aspectRatioOptions.map(option => option.id), ['1:1', '3:2', '2:3', '16:9', '9:16']);
  for (const [kind, definitions] of Object.entries({ viewpoint: viewpoints, encounter: encounters, silhouette: biologicalSilhouettes })) {
    assert.deepEqual(directionOptions[kind].map(option => option.id), Object.keys(definitions));
    assert(directionOptions[kind].every(option => option.label && option.description));
  }
});
