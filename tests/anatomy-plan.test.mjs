import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnatomyPlan, plannedDesign } from '../shared/anatomy-plan.mjs';
import { bodyPlans } from '../shared/body-plans.mjs';
import { Anatomy, example, GenerationSpecimen, Settings, illustrationPrompt } from '../shared/specimen.mjs';
import { animalTypes, animalTypeIds } from '../shared/animal-types.mjs';
import { viewpoints, encounters, compositions, biologicalSilhouettes } from '../shared/encounter-directions.mjs';

const settings = Settings.parse({ absurdity: 65, deviancy: 35, lethality: 70, height: 100 });
const specimenFor = plan => ({ ...example, anatomy: plan.anatomy ? { ...example.anatomy, ...plan.anatomy } : null,
  biology: { ...example.biology, legCount: plan.anatomy ? plan.anatomy.legPairs * 2 : 0 }, variation: plan });

test('anatomy plans replay from seed and recent history, independently of print size and colors', () => {
  const first = createAnatomyPlan(settings, 'seed-one');
  const history = [specimenFor(first)];
  const plan = createAnatomyPlan(settings, 'seed-two', history);
  assert.deepEqual(createAnatomyPlan(settings, 'seed-two', history), plan);
  assert.deepEqual(createAnatomyPlan({ ...settings, height: 500, baseplate: false }, 'seed-two', history), plan);
  assert.notDeepEqual(plan.anatomy, first.anatomy);
  assert.equal(GenerationSpecimen.safeParse(specimenWithoutMetadata(specimenFor(plan))).success, true);
});

test('a repeated default request explores silhouettes, proportions and counts over the saved history', () => {
  const history = [], families = new Map(), values = {};
  for (let index = 0; index < 120; index++) {
    const plan = createAnatomyPlan(settings, `population-${index}`, history);
    assert(GenerationSpecimen.safeParse(specimenWithoutMetadata(specimenFor(plan))).success);
    families.set(plan.family, (families.get(plan.family) || 0) + 1);
    for (const [key, value] of Object.entries(plan.anatomy)) (values[key] ??= new Set()).add(value);
    history.unshift(specimenFor(plan));
  }
  assert.equal(families.size, Object.keys(bodyPlans).length);
  for (const frequency of families.values()) assert(frequency >= 15 && frequency <= 25, `Family frequency ${frequency}`);
  for (const [key, count] of Object.entries({ legPairs: 5, eyes: 6, horns: 7, antennae: 5, backPlates: 9 })) {
    assert.equal(values[key].size, count, `${key} covers every supported count`);
  }
  for (const key of ['bodyLength', 'bodyWidth', 'bodyHeight', 'headSize', 'headWidth', 'headDepth', 'headHeight', 'stanceWidth']) {
    assert(values[key].size > 30, `${key} is independently varied`);
  }
  const ratios = history.map(({ anatomy: a }) => [a.bodyLength / a.bodyWidth, a.bodyHeight / a.bodyWidth]);
  assert(Math.max(...ratios.map(r => r[0])) > 3.2, 'Long narrow bodies');
  assert(Math.min(...ratios.map(r => r[0])) < 1, 'Broad bodies');
  assert(Math.max(...ratios.map(r => r[1])) > 1.5, 'Deep bodies');
  assert(Math.min(...ratios.map(r => r[1])) < .5, 'Flat bodies');
});

test('legacy specimens discourage their repeated leg and eye counts; demo specimens do not bias sampling', () => {
  const history = Array.from({ length: 5 }, () => ({ ...example, anatomy: { ...example.anatomy, eyes: 6 } }));
  const plan = createAnatomyPlan(settings, 'legacy', history);
  assert.notEqual(plan.anatomy.legPairs, 3);
  assert.notEqual(plan.anatomy.eyes, 6);
  assert.deepEqual(createAnatomyPlan(settings, 'legacy', [{ ...example, demo: true }]), createAnatomyPlan(settings, 'legacy'));
});

test('default design output must keep the sampled anatomy and prose and portrait use the same traits', () => {
  const plan = createAnatomyPlan(settings, 'locked-design');
  const request = plannedDesign(settings, plan);
  const specimen = specimenFor(plan);
  assert.deepEqual(request.parse(specimenWithoutMetadata(specimen)).anatomy, specimen.anatomy);
  for (const [key, value] of Object.entries(plan.anatomy)) {
    assert.deepEqual(request.schema.properties.anatomy.properties[key].enum, [value]);
  }
  assert.throws(() => request.parse({ ...example, anatomy: { ...specimen.anatomy, eyes: specimen.anatomy.eyes === 1 ? 2 : 1 } }));
  assert(request.parse({ ...specimenWithoutMetadata(specimen), anatomy: { ...specimen.anatomy, color: '#123456' } }));
  assert(request.prompt.includes(JSON.stringify(plan.anatomy)));
  assert(illustrationPrompt(specimen).includes(JSON.stringify(specimen.biology)));
  assert(!illustrationPrompt(specimen).includes(JSON.stringify(specimen.anatomy)));
});

function specimenWithoutMetadata({ variation, ...specimen }) { return specimen; }

test('explicit physical preferences can override the roll within safe geometry limits', () => {
  const custom = { ...settings, prompt: 'Four legs, two eyes, a broad flat head, no horns or tail.' };
  const plan = createAnatomyPlan(custom, 'prompt-override');
  const request = plannedDesign(custom, plan);
  const anatomy = { ...Anatomy.parse(example.anatomy), legLength: 3, legPairs: 2, eyes: 2,
    horns: 0, tailLength: 0, headWidth: 1.4, headHeight: .65 };
  assert.deepEqual(request.parse({ ...example, anatomy, biology: { ...example.biology, legCount: 4 } }).anatomy, anatomy);
  assert.equal(request.schema.properties.anatomy.properties.legPairs.enum, undefined);
  assert.throws(() => request.parse({ ...example, anatomy: { ...anatomy, legLength: 16 } }));
});

test('default inspiration pool covers the animal kingdom and persists varied camera encounters', () => {
  const history = [], groups = new Set(), angles = new Set(), activities = new Set(), framing = new Set(), silhouettes = new Set();
  for (let index = 0; index < 120; index++) {
    const plan = createAnatomyPlan({ ...settings, printModel: false }, `kingdom-${index}`, history);
    assert.equal(plan.anatomy, null); assert.equal(plan.family, null);
    assert(plan.inspirationIds.length >= 1 && plan.inspirationIds.length <= 3);
    assert.equal(new Set(plan.inspirationIds).size, plan.inspirationIds.length);
    assert(plan.inspirationIds.some(id => !animalTypes.find(type => type.id === id).fictional));
    for (const id of plan.inspirationIds) groups.add(id);
    angles.add(plan.portrait.viewpoint); activities.add(plan.portrait.encounter);
    framing.add(plan.portrait.composition); silhouettes.add(plan.silhouette);
    assert.notEqual(plan.portrait.viewpoint, history[0]?.variation.portrait.viewpoint, 'Successive generations change the camera angle');
    assert(plannedDesign({ ...settings, printModel: false }, plan).prompt.includes(biologicalSilhouettes[plan.silhouette]));
    history.unshift(specimenFor(plan));
  }
  assert.deepEqual([...groups].sort(), [...animalTypeIds].sort());
  assert.deepEqual([...angles].sort(), Object.keys(viewpoints).sort());
  assert.deepEqual([...activities].sort(), Object.keys(encounters).sort());
  assert.deepEqual([...framing].sort(), Object.keys(compositions).sort());
  assert.deepEqual([...silhouettes].sort(), Object.keys(biologicalSilhouettes).sort());
});

test('camera selection avoids the latest angle even when it is the least-used angle', () => {
  const latest = 'overhead';
  const history = [{ ...example, variation: { portrait: { viewpoint: latest } } },
    ...Object.keys(viewpoints).filter(id => id !== latest).flatMap(viewpoint =>
      Array.from({ length: 2 }, () => ({ ...example, variation: { portrait: { viewpoint } } })))];
  for (let index = 0; index < 20; index++) {
    const plan = createAnatomyPlan({ ...settings, printModel: false }, `camera-${index}`, history);
    assert.notEqual(plan.portrait.viewpoint, latest);
    const specimen = specimenFor(plan);
    assert.equal(illustrationPrompt(specimen), illustrationPrompt(structuredClone(specimen)), 'A persisted plan fixes the composition on retry');
  }
});

test('selected animal chips limit the inspiration pool, including single and fictional-only choices', () => {
  for (const selected of [['birds'], ['fish', 'cephalopods'], ['sky-drifters', 'dream-mimics']]) {
    for (let index = 0; index < 20; index++) {
      const plan = createAnatomyPlan({ ...settings, animalTypes: selected }, `selection-${index}`);
      assert(plan.inspirationIds.every(id => selected.includes(id)));
      if (selected.length === 1) assert.deepEqual(plan.inspirationIds, selected);
    }
  }
  for (const id of ['fish', 'cephalopods', 'snails', 'worms', 'sponges', 'jellyfish']) {
    assert.equal(createAnatomyPlan({ ...settings, animalTypes: [id] }, id).anatomy.legPairs, 0);
  }
});

test('No legs is enforced for both modes even when free text requests conflicting legs', () => {
  for (const printModel of [true, false]) {
    const custom = { ...settings, printModel, legless: true, animalTypes: ['birds'], prompt: 'Give it four legs.' };
    const plan = createAnatomyPlan(custom, 'no-legs');
    const design = plannedDesign(custom, plan);
    const record = specimenWithoutMetadata(specimenFor(plan));
    assert.equal(design.parse(record).biology.legCount, 0);
    assert.throws(() => design.parse({ ...record, biology: { ...record.biology, legCount: 4 } }));
    if (printModel) {
      assert.equal(plan.anatomy.legPairs, 0); assert.equal(plan.anatomy.legLength, 0);
      assert.throws(() => design.parse({ ...record, anatomy: { ...record.anatomy, legPairs: 2 } }));
    }
  }
});

test('unrestricted biology can have forms and counts the simplified sculpt cannot express', () => {
  const custom = { ...settings, printModel: false, animalTypes: ['worms'] };
  const plan = createAnatomyPlan(custom, 'many-appendages');
  const design = plannedDesign(custom, plan);
  const record = { ...example, anatomy: null, biology: { ...example.biology,
    bodyPlan: 'A translucent branching colony with repeated swimming bells and a thousand articulated limbs.', legCount: 1000 } };
  assert.deepEqual(design.parse(record), record);
  assert.throws(() => design.parse({ ...record, anatomy: Anatomy.parse(example.anatomy) }));
  assert.equal(design.schema.properties.anatomy.type, 'null');
});
