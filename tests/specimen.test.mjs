import test from 'node:test';
import assert from 'node:assert/strict';
import { example, Anatomy, Specimen, GenerationSpecimen, specimenSchema, Settings, creaturePrompt, illustrationPrompt } from '../shared/specimen.mjs';

test('new generation schema prevents tall legs while preserving historical records', () => {
  assert(Specimen.safeParse(example).success, 'Saved legacy anatomy is still readable');
  assert(!GenerationSpecimen.safeParse(example).success, 'New output must satisfy the shorter leg limit');
  assert(GenerationSpecimen.safeParse({...example,anatomy:{...Anatomy.parse(example.anatomy),legLength:3}}).success);
  assert.equal(specimenSchema.properties.anatomy.properties.legLength.maximum,6);
});
test('femme and psychedelic are validated, optional for older clients, and reach both prompts', () => {
  const base = { prompt: '', absurdity: 50, deviancy: 10, lethality: 20, height: 100 };
  assert.deepEqual(Settings.parse(base), { ...base, femme: 0, psychedelic: 0, baseplate: true,
    printModel: true, animalTypes: [], legless: false });
  assert(!Settings.safeParse({ ...base, femme: 101 }).success);
  assert(!Settings.safeParse({ ...base, psychedelic: -1 }).success);
  const settings = Settings.parse({ ...base, femme: 90, psychedelic: 95 });
  assert.match(creaturePrompt(settings), /"femme":90/); assert.match(creaturePrompt(settings), /Psychedelic: 0 =/);
  assert.match(illustrationPrompt({ ...example, settings }), /Femme styling/);
  assert.match(illustrationPrompt({ ...example, settings }), /bold saturated palette/);
  assert.match(illustrationPrompt(example), /restrained natural-history color palette/, 'Saved specimens without settings keep the muted look');
});
test('print settings accept 500 mm and optional baseplates with legacy defaults', () => {
  const base = { absurdity: 50, deviancy: 10, lethality: 20, height: 500 };
  assert.equal(Settings.parse(base).height, 500);
  assert.equal(Settings.parse(base).baseplate, true);
  assert.equal(Settings.parse({ ...base, baseplate: false }).baseplate, false);
  for (const height of [59, 501, 100.5, Infinity]) assert(!Settings.safeParse({ ...base, height }).success);
  assert(!Settings.safeParse({ ...base, baseplate: 'false' }).success);
});

test('animal selection, legless and optional printing are validated without changing legacy defaults', () => {
  const base = { absurdity: 80, deviancy: 40, lethality: 30, height: 100 };
  const settings = Settings.parse({ ...base, printModel: false, animalTypes: ['birds', 'cephalopods'], legless: true });
  assert.equal(settings.printModel, false);
  assert.equal(settings.legless, true);
  assert.deepEqual(settings.animalTypes, ['birds', 'cephalopods']);
  assert.equal(Settings.parse(base).printModel, true);
  for (const values of [{ printModel: 'false' }, { legless: 1 }, { animalTypes: ['unknown'] },
    { animalTypes: ['birds', 'birds'] }, { animalTypes: 'birds' }]) {
    assert.equal(Settings.safeParse({ ...base, ...values }).success, false);
  }
});

test('portraits put the organism inside its described habitat with occlusion and stored viewpoint', () => {
  const specimen = { ...example, anatomy: null, settings: { printModel: false },
    habitat: 'Beneath submerged mangrove roots in dark brackish water.',
    biology: { ...example.biology, bodyPlan: 'A transparent swimming mantle with eight branching arms.', legCount: 0 },
    variation: { portrait: { viewpoint: 'overhead', encounter: 'feeding' } } };
  const prompt = illustrationPrompt(specimen);
  assert(prompt.includes(specimen.habitat));
  assert(prompt.includes(JSON.stringify(specimen.biology)));
  assert.match(prompt, /almost straight down/);
  assert.match(prompt, /foreground elements naturally obscure/i);
  assert.match(prompt, /feeding or food-searching/);
  assert.match(prompt, /This animal has NO LEGS/);
  assert.doesNotMatch(prompt, /three-quarter view|dark olive charcoal studio|Keep thick legs/);
  assert.equal(illustrationPrompt(specimen), prompt, 'A portrait retry has the same habitat and composition request');
});

test('unrestricted prompts allow radical biology without carrying over print restrictions', () => {
  const settings = Settings.parse({ absurdity: 95, deviancy: 90, lethality: 85, height: 100, printModel: false });
  const prompt = creaturePrompt(settings);
  assert.match(prompt, /Set anatomy to null/);
  assert.match(prompt, /parasitism/);
  assert.match(prompt, /sexual cannibalism/);
  assert.match(prompt, /clinical, non-erotic/);
  assert.doesNotMatch(prompt, /short thick|wide feet|legLength is belly clearance/);
});

test('scene instructions carry the actual field observation, food and ecological interactions', () => {
  const reef = { ...example, anatomy: null,
    habitat: 'Inside a drowned mangrove lattice above a bed of broken oyster shells.',
    diet: 'It pulls ribbon worms out of the shells with branching feeding arms.',
    fieldNote: 'A feeding arm pushed an oyster shell over its own eye while extracting a worm.',
    courtship: 'Adults exchange polished oyster shells beneath the mangrove roots.',
    danger: 'Its feeding arms seize anything that vibrates inside an abandoned shell.',
    variation: { portrait: { viewpoint: 'rear', encounter: 'feeding', composition: 'screen' } } };
  const impossible = { ...reef,
    habitat: 'In a vaulted junction where vertical gravel paths fold through stone archways.',
    diet: 'It eats small animals stranded where the gravel paths intersect.',
    fieldNote: 'The animal folded a gravel path until a trapped moth slid into its mouth.' };
  const reefPrompt = illustrationPrompt(reef), impossiblePrompt = illustrationPrompt(impossible);
  for (const key of ['habitat', 'diet', 'fieldNote', 'courtship', 'danger']) assert(reefPrompt.includes(reef[key]), key);
  for (const key of ['habitat', 'diet', 'fieldNote']) assert(impossiblePrompt.includes(impossible[key]), key);
  assert(!reefPrompt.includes(impossible.fieldNote));
  assert(!impossiblePrompt.includes(reef.fieldNote));
  assert.match(reefPrompt, /food visible at the feeding organ/);
  assert.match(reefPrompt, /View from behind/);
  assert.match(reefPrompt, /foreground element crosses a substantial part of the body/);
  assert.match(impossiblePrompt, /visibly alter geometry/);
  assert.match(impossiblePrompt, /generic dirt floor and fog/);
});

test('full biology isolates the image from simplified CAD proportions while preserving palette and legacy anatomy', () => {
  const first = { ...example, biology: { ...example.biology, bodyPlan: 'A thin ribbon-bodied swimmer with a translucent fan of feeding arms.' } };
  const second = { ...first, anatomy: { ...first.anatomy, bodyWidth: 25, bodyHeight: 26, headWidth: 1.4, legLength: 6 } };
  const prompt = illustrationPrompt(first);
  assert.equal(illustrationPrompt(second), prompt, 'Changing CAD dimensions does not turn the biological image into a stocky figurine');
  assert(prompt.includes(JSON.stringify(first.biology)));
  assert(prompt.includes(first.anatomy.color));
  assert(!prompt.includes(JSON.stringify(first.anatomy)));
  const { biology, ...legacy } = first;
  assert(illustrationPrompt(legacy).includes(JSON.stringify(first.anatomy)), 'Records predating biology still retain their physical description');
});
