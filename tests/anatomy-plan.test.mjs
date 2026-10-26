import test from 'node:test';
import assert from 'node:assert/strict';
import { AnatomyPlan, createAnatomyPlan, isPlanCompatible, parseAnatomyPlan, plannedDesign } from '../shared/anatomy-plan.mjs';
import { example, GenerationSpecimen, Settings, illustrationPrompt } from '../shared/specimen.mjs';
import { createVisualRequirements } from '../shared/visual-requirements.mjs';
import { animalTypes, animalTypeIds } from '../shared/animal-types.mjs';
import { viewpoints, encounters, compositions, biologicalSilhouettes } from '../shared/encounter-directions.mjs';

const settings = Settings.parse({ absurdity: 65, deviancy: 35, lethality: 70 });
const organism = (input = settings) => ({ ...example, anatomy: null, visualRequirements: createVisualRequirements(input) });
const specimenFor = plan => ({ ...organism(), variation: plan });

test('plans replay from seed and recent history independently of legacy print settings', () => {
  const first = createAnatomyPlan(settings, 'seed-one');
  const history = [specimenFor(first)];
  const plan = createAnatomyPlan(settings, 'seed-two', history);
  assert.deepEqual(createAnatomyPlan(settings, 'seed-two', history), plan);
  assert.deepEqual(createAnatomyPlan({ ...settings, height: 500, baseplate: false, printModel: true }, 'seed-two', history), plan);
  assert.deepEqual(AnatomyPlan.parse(plan), plan);
  assert.equal(plan.anatomy, null); assert.equal(plan.family, null);
  assert.equal(GenerationSpecimen.safeParse(organism()).success, true);
  assert.deepEqual(createAnatomyPlan(settings, 'seed-one', [{ ...example, demo: true }]), first);
});

test('default pool explores animal groups, silhouettes and scenes over recent history', () => {
  const history = [], groups = new Set(), angles = new Set(), activities = new Set(), framing = new Set(), silhouettes = new Set();
  for (let index = 0; index < 120; index++) {
    const plan = createAnatomyPlan(settings, `kingdom-${index}`, history);
    assert(plan.inspirationIds.length >= 1 && plan.inspirationIds.length <= 3);
    assert.equal(new Set(plan.inspirationIds).size, plan.inspirationIds.length);
    assert(plan.inspirationIds.some(id => !animalTypes.find(type => type.id === id).fictional));
    plan.inspirationIds.forEach(id => groups.add(id));
    angles.add(plan.portrait.viewpoint); activities.add(plan.portrait.encounter);
    framing.add(plan.portrait.composition); silhouettes.add(plan.silhouette);
    assert.notEqual(plan.portrait.viewpoint, history[0]?.variation.portrait.viewpoint);
    assert(plannedDesign(settings, plan).prompt.includes(biologicalSilhouettes[plan.silhouette]));
    history.unshift(specimenFor(plan));
  }
  assert.deepEqual([...groups].sort(), [...animalTypeIds].sort());
  assert.deepEqual([...angles].sort(), Object.keys(viewpoints).sort());
  assert.deepEqual([...activities].sort(), Object.keys(encounters).sort());
  assert.deepEqual([...framing].sort(), Object.keys(compositions).sort());
  assert.deepEqual([...silhouettes].sort(), Object.keys(biologicalSilhouettes).sort());
});

test('camera avoids the preceding angle unless the user explicitly locks it', () => {
  const history = [{ ...example, variation: { portrait: { viewpoint: 'overhead' } } },
    ...Object.keys(viewpoints).filter(id => id !== 'overhead').flatMap(viewpoint =>
      Array.from({ length: 2 }, () => ({ ...example, variation: { portrait: { viewpoint } } })))];
  for (let index = 0; index < 20; index++) {
    assert.notEqual(createAnatomyPlan(settings, `camera-${index}`, history).portrait.viewpoint, 'overhead');
  }
  const locked = Settings.parse({ ...settings, directionLocks: { viewpoint: 'overhead', encounter: 'feeding', silhouette: 'ribbon' } });
  const plan = createAnatomyPlan(locked, 'camera-lock', history);
  assert.equal(plan.portrait.viewpoint, 'overhead'); assert.equal(plan.portrait.encounter, 'feeding');
  assert.equal(plan.silhouette, 'ribbon');
  assert.equal(isPlanCompatible(locked, plan), true);
});

test('selected chips limit the pool and an inspiration lock uses every selected group', () => {
  for (const selected of [['birds'], ['fish', 'cephalopods'], ['sky-drifters', 'dream-mimics']]) {
    const selectedSettings = Settings.parse({ ...settings, animalTypes: selected });
    for (let index = 0; index < 20; index++) {
      const plan = createAnatomyPlan(selectedSettings, `selection-${index}`);
      assert(plan.inspirationIds.every(id => selected.includes(id)));
      if (selected.length === 1) assert.deepEqual(plan.inspirationIds, selected);
    }
    const locked = { ...selectedSettings, directionLocks: { ...selectedSettings.directionLocks, inspirations: true } };
    assert.deepEqual(createAnatomyPlan(locked, 'locked-groups').inspirationIds, selected);
  }
  for (const animalTypes of [[], ['birds', 'fish', 'worms', 'snails']]) {
    assert.equal(Settings.safeParse({ ...settings, animalTypes, directionLocks: { inspirations: true } }).success, false);
  }
});

test('follow-description mode avoids unrelated random biological and scene directions', () => {
  const literal = Settings.parse({ ...settings, intent: 'literal', prompt: 'A black cat with no wings.' });
  const plan = createAnatomyPlan(literal, 'literal-cat');
  assert.deepEqual(plan.inspirationIds, []); assert.equal(plan.silhouette, null); assert.equal(plan.challenge, null);
  assert.equal(plan.portrait.viewpoint, null); assert.equal(plan.portrait.encounter, null);
  assert.equal(isPlanCompatible(literal, plan), true);
  assert.match(plannedDesign(literal, plan).prompt, /Do not inject unrelated lineages/);
  assert.doesNotMatch(plannedDesign(literal, plan).prompt, /cephalopods|mantle|membranous/i);
});

test('preview plans reject invalid values and conflicting settings while replaying a frozen scene', () => {
  const plan = createAnatomyPlan(settings, 'preview');
  assert.deepEqual(parseAnatomyPlan(plan, settings), plan);
  assert.equal(isPlanCompatible(settings, { ...plan, inspirationIds: ['not-an-animal'] }), false);
  assert.equal(isPlanCompatible(settings, { ...plan, portrait: { ...plan.portrait, viewpoint: 'injected direction' } }), false);
  const locked = { ...settings, directionLocks: { ...settings.directionLocks, viewpoint: 'rear' } };
  assert.equal(isPlanCompatible(locked, { ...plan, portrait: { ...plan.portrait, viewpoint: 'profile' } }), false);
  assert.throws(() => parseAnatomyPlan({ ...plan, portrait: { ...plan.portrait, viewpoint: 'profile' } }, locked), /Preview directions/);
  assert.equal(isPlanCompatible({ ...settings, animalTypes: ['birds'] }, { ...plan, inspirationIds: ['fish'] }), false);
  assert.equal(isPlanCompatible({ ...settings, compositionMode: 'cutout' }, plan), false);
  assert.equal(illustrationPrompt(specimenFor(plan)), illustrationPrompt(structuredClone(specimenFor(plan))));
});

test('all new designs are image-first even when a legacy client sends printModel true', () => {
  const custom = { ...settings, printModel: true, prompt: 'A millipede with one thousand legs.' };
  const plan = createAnatomyPlan(custom, 'many-appendages');
  const design = plannedDesign(custom, plan);
  const record = { ...organism(custom), biology: { ...example.biology, legCount: 1000 } };
  assert.deepEqual(design.parse(record), record);
  assert.equal(design.schema.properties.anatomy.type, 'null');
  assert.equal(plan.anatomy, null);
  assert.throws(() => design.parse({ ...record, anatomy: example.anatomy }));
});

test('No legs remains a strict biological count even when user text conflicts', () => {
  const custom = { ...settings, legless: true, prompt: 'Give it four legs.' };
  const design = plannedDesign(custom, createAnatomyPlan(custom, 'no-legs'));
  const record = { ...organism(custom), biology: { ...example.biology, legCount: 0 } };
  assert.equal(design.parse(record).biology.legCount, 0);
  assert.throws(() => design.parse({ ...record, biology: { ...record.biology, legCount: 4 } }));
  assert.deepEqual(design.schema.properties.biology.properties.legCount.enum, [0]);
});

test('design parsing preserves immutable raw text and user lists alongside extracted requirements', () => {
  const custom = { ...settings, prompt: 'Exactly four legs. No wings.', requiredFeatures: ['matte black fur'], excludedFeatures: ['horns'] };
  const design = plannedDesign(custom, createAnatomyPlan(custom, 'constraints'));
  const record = { ...organism(custom), visualRequirements: { originalPrompt: custom.prompt, required: ['four legs'], excluded: ['wings'] } };
  const parsed = design.parse(record);
  assert.deepEqual(parsed.visualRequirements, { originalPrompt: custom.prompt, required: ['matte black fur', 'four legs'], excluded: ['horns', 'wings'] });
  assert.throws(() => design.parse({ ...record, visualRequirements: { ...record.visualRequirements, originalPrompt: 'different request' } }));
  assert.deepEqual(design.schema.properties.visualRequirements.properties.originalPrompt.enum, [custom.prompt]);
  assert.match(illustrationPrompt({ ...parsed, settings: custom }), /Exactly four legs\. No wings\./);
});
