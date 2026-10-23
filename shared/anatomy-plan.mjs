import { z } from 'zod';
import { GenerationAnatomy, GenerationSpecimen, creaturePrompt } from './specimen.mjs';
import { bodyPlans, shapeRanges } from './body-plans.mjs';

const HISTORY_SIZE = 18;
export const ANATOMY_PLAN_VERSION = 1;

function seededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function balancedChoice(options, used, random) {
  const counts = options.map(value => used.filter(item => item === value).length);
  const minimum = Math.min(...counts);
  const candidates = options.filter((_, index) => counts[index] === minimum);
  const fresh = candidates.filter(value => value !== used[0]);
  const choices = fresh.length ? fresh : candidates;
  return choices[Math.floor(random() * choices.length)];
}

function familyOf(specimen) {
  const axes = ['bodyLength', 'bodyWidth', 'bodyHeight'];
  const plan = specimen.variation;
  if (Object.hasOwn(bodyPlans, plan?.family) && axes.every(key => specimen.anatomy[key] === plan.anatomy?.[key])) return plan.family;
  // Historical specimens have no plan metadata; their torso proportions still count.
  const distance = ranges => axes.reduce((sum, key) => {
    const midpoint = (ranges[key][0] + ranges[key][1]) / 2;
    return sum + ((specimen.anatomy[key] - midpoint) / midpoint) ** 2;
  }, 0);
  return Object.keys(bodyPlans).sort((a, b) => distance(bodyPlans[a]) - distance(bodyPlans[b]))[0];
}

export function createAnatomyPlan(settings, seed, specimens = []) {
  const random = seededRandom(seed);
  const recent = specimens.filter(item => !item.demo && item.anatomy).slice(0, HISTORY_SIZE);
  const family = balancedChoice(Object.keys(bodyPlans), recent.map(familyOf), random);
  const range = ([min, max]) => Math.round((min + random() * (max - min)) * 100) / 100;
  const choose = (key, max) => balancedChoice(Array.from({ length: max + 1 }, (_, i) => i),
    recent.map(item => item.anatomy[key]), random);
  const eyes = balancedChoice(settings.absurdity < 30 ? [1, 2, 3] : [1, 2, 3, 4, 5, 6],
    recent.map(item => item.anatomy.eyes), random);
  const anatomy = {
    ...Object.fromEntries(Object.entries({ ...bodyPlans[family], ...shapeRanges }).map(([key, bounds]) => [key, range(bounds)])),
    legPairs: choose('legPairs', 4), eyes,
    horns: choose('horns', settings.lethality < 35 ? 2 : 6),
    antennae: choose('antennae', settings.absurdity < 30 ? 2 : 4),
    backPlates: choose('backPlates', 8),
    tailLength: balancedChoice([0, 6, 16, 28], recent.map(item => item.anatomy.tailLength), random),
    texture: balancedChoice(['smooth', 'speckled', 'ridged'], recent.map(item => item.anatomy.texture), random),
  };
  if (!anatomy.legPairs) anatomy.legLength = 0;
  return { version: ANATOMY_PLAN_VERSION, seed: String(seed), family, anatomy };
}

export function plannedDesign(settings, plan) {
  // Empty-text requests cannot collapse back to the model's favourite anatomy.
  // Free text may specify physical constraints, so it retains the full safe range.
  const anatomy = settings.prompt?.trim() ? GenerationAnatomy : GenerationAnatomy.extend(
    Object.fromEntries(Object.entries(plan.anatomy).map(([key, value]) => [key, z.literal(value)])));
  const validation = GenerationSpecimen.extend({ anatomy });
  const schema = z.toJSONSchema(validation, { target: 'draft-7' });
  delete schema.$schema;
  for (const field of Object.values(schema.properties.anatomy.properties)) {
    if (Object.hasOwn(field, 'const')) { field.enum = [field.const]; delete field.const; }
  }
  return { prompt: creaturePrompt(settings, plan), schema, parse: data => validation.parse(data) };
}
