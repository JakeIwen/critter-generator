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
  assert.match(prompt, /foreground elements naturally obscure/);
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
