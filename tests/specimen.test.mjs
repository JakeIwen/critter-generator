import test from 'node:test';
import assert from 'node:assert/strict';
import { example, Specimen, GenerationSpecimen, specimenSchema, Settings, creaturePrompt, illustrationPrompt } from '../shared/specimen.mjs';

test('new generation schema prevents tall legs while preserving historical records', () => {
  assert(Specimen.safeParse(example).success, 'Saved legacy anatomy is still readable');
  assert(!GenerationSpecimen.safeParse(example).success, 'New output must satisfy the shorter leg limit');
  assert(GenerationSpecimen.safeParse({...example,anatomy:{...example.anatomy,legLength:3}}).success);
  assert.equal(specimenSchema.properties.anatomy.properties.legLength.maximum,6);
});
test('femme and psychedelic are validated, optional for older clients, and reach both prompts', () => {
  const base = { prompt: '', absurdity: 50, deviancy: 10, lethality: 20, height: 100 };
  assert.deepEqual(Settings.parse(base), { ...base, femme: 0, psychedelic: 0 });
  assert(!Settings.safeParse({ ...base, femme: 101 }).success);
  assert(!Settings.safeParse({ ...base, psychedelic: -1 }).success);
  const settings = Settings.parse({ ...base, femme: 90, psychedelic: 95 });
  assert.match(creaturePrompt(settings), /"femme":90/); assert.match(creaturePrompt(settings), /Psychedelic: 0 =/);
  assert.match(illustrationPrompt({ ...example, settings }), /Femme styling/);
  assert.match(illustrationPrompt({ ...example, settings }), /bold saturated palette/);
  assert.match(illustrationPrompt(example), /restrained natural-history color palette/, 'Saved specimens without settings keep the muted look');
});
