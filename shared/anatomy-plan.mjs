import { z } from 'zod';
import { Biology, GenerationAnatomy, GenerationSpecimen, creaturePrompt } from './specimen.mjs';
import { bodyPlans, shapeRanges } from './body-plans.mjs';
import { animalTypes, animalTypeById } from './animal-types.mjs';
import { viewpoints, encounters, compositions, biologicalSilhouettes, biologicalChallenges } from './encounter-directions.mjs';

const HISTORY_SIZE = 18;
export const ANATOMY_PLAN_VERSION = 3;

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

function selectInspirations(settings, recent, random) {
  const selected = settings.animalTypes ?? [];
  const pool = selected.length ? selected : animalTypes.map(type => type.id);
  const count = Math.min(pool.length, [1, 1, 2, 2, 3][Math.floor(random() * 5)]);
  const used = recent.flatMap(item => item.variation?.inspirationIds ?? []);
  const ids = [];
  for (let index = 0; index < count; index++) {
    // Unrestricted rolls always start from real animal biology; fictional-only selections are valid.
    const options = pool.filter(id => !ids.includes(id) && (selected.length || index > 0 || !animalTypeById[id].fictional));
    ids.push(balancedChoice(options, used, random));
  }
  return ids;
}

function samplePrintAnatomy(settings, family, inspirationIds, recent, random) {
  const range = ([min, max]) => Math.round((min + random() * (max - min)) * 100) / 100;
  const choose = (key, max) => balancedChoice(Array.from({ length: max + 1 }, (_, i) => i),
    recent.map(item => item.anatomy[key]), random);
  const legOptions = [...new Set(inspirationIds.flatMap(id => animalTypeById[id].legPairs))];
  const eyes = balancedChoice(settings.absurdity < 30 ? [1, 2, 3] : [1, 2, 3, 4, 5, 6],
    recent.map(item => item.anatomy.eyes), random);
  const anatomy = {
    ...Object.fromEntries(Object.entries({ ...bodyPlans[family], ...shapeRanges }).map(([key, bounds]) => [key, range(bounds)])),
    legPairs: settings.legless ? 0 : balancedChoice(legOptions, recent.map(item => item.anatomy.legPairs), random), eyes,
    horns: choose('horns', settings.lethality < 35 ? 2 : 6),
    antennae: choose('antennae', settings.absurdity < 30 ? 2 : 4),
    backPlates: choose('backPlates', 8),
    tailLength: balancedChoice([0, 6, 16, 28], recent.map(item => item.anatomy.tailLength), random),
    texture: balancedChoice(['smooth', 'speckled', 'ridged'], recent.map(item => item.anatomy.texture), random),
  };
  if (!anatomy.legPairs) anatomy.legLength = 0;
  return anatomy;
}

export function createAnatomyPlan(settings, seed, specimens = []) {
  const random = seededRandom(seed);
  const recent = specimens.filter(item => !item.demo).slice(0, HISTORY_SIZE);
  const inspirationIds = selectInspirations(settings, recent, random);
  const previousView = recent.find(item => item.variation?.portrait?.viewpoint)?.variation.portrait.viewpoint;
  const portrait = {
    viewpoint: balancedChoice(Object.keys(viewpoints).filter(id => id !== previousView),
      recent.map(item => item.variation?.portrait?.viewpoint), random),
    encounter: balancedChoice(Object.keys(encounters), recent.map(item => item.variation?.portrait?.encounter), random),
    composition: balancedChoice(Object.keys(compositions), recent.map(item => item.variation?.portrait?.composition), random),
  };
  const silhouette = balancedChoice(Object.keys(biologicalSilhouettes), recent.map(item => item.variation?.silhouette), random);
  const challenge = balancedChoice(biologicalChallenges, recent.map(item => item.variation?.challenge), random);
  const printed = recent.filter(item => item.anatomy);
  const family = settings.printModel === false ? null : balancedChoice(Object.keys(bodyPlans), printed.map(familyOf), random);
  const anatomy = family ? samplePrintAnatomy(settings, family, inspirationIds, printed, random) : null;
  return { version: ANATOMY_PLAN_VERSION, seed: String(seed), inspirationIds, portrait, silhouette, challenge, family, anatomy };
}

export function plannedDesign(settings, plan) {
  // Empty-text requests cannot collapse back to the model's favourite anatomy.
  // Free text may specify physical constraints, so it retains the full safe range.
  const printModel = settings.printModel !== false;
  let anatomy = z.null();
  let biology = Biology;
  if (printModel) {
    anatomy = settings.prompt?.trim() ? GenerationAnatomy : GenerationAnatomy.extend(
      Object.fromEntries(Object.entries(plan.anatomy).map(([key, value]) => [key, z.literal(value)])));
    if (!settings.prompt?.trim()) biology = biology.extend({ legCount: z.literal(plan.anatomy.legPairs * 2) });
    if (settings.legless) anatomy = anatomy.extend({ legPairs: z.literal(0), legLength: z.literal(0) });
  }
  if (settings.legless) biology = biology.extend({ legCount: z.literal(0) });
  const validation = GenerationSpecimen.extend({ anatomy, biology });
  const schema = z.toJSONSchema(validation, { target: 'draft-7' });
  delete schema.$schema;
  for (const group of ['anatomy', 'biology']) {
    for (const field of Object.values(schema.properties[group].properties ?? {})) {
      if (Object.hasOwn(field, 'const')) { field.enum = [field.const]; delete field.const; }
    }
  }
  return { prompt: creaturePrompt(settings, plan), schema, parse: data => {
    const parsed = validation.parse(data);
    if (parsed.anatomy && parsed.biology.legCount !== parsed.anatomy.legPairs * 2) {
      throw new Error('Biology and simplified print anatomy disagree on leg count.');
    }
    return parsed;
  } };
}
