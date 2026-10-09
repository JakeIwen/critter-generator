import test from 'node:test';
import assert from 'node:assert/strict';
import { example, Specimen, GenerationSpecimen, specimenSchema } from '../shared/specimen.mjs';

test('new generation schema prevents tall legs while preserving historical records', () => {
  assert(Specimen.safeParse(example).success, 'Saved legacy anatomy is still readable');
  assert(!GenerationSpecimen.safeParse(example).success, 'New output must satisfy the shorter leg limit');
  assert(GenerationSpecimen.safeParse({...example,anatomy:{...example.anatomy,legLength:3}}).success);
  assert.equal(specimenSchema.properties.anatomy.properties.legLength.maximum,6);
});
