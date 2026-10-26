import { z } from 'zod';
import { Biology, GenerationSpecimen, creaturePrompt } from './specimen.mjs';
import { animalTypes, animalTypeIds, animalTypeById } from './animal-types.mjs';
import { viewpoints, encounters, compositions, biologicalSilhouettes, biologicalChallenges } from './encounter-directions.mjs';
import { createVisualRequirements, InputVisualFeatures, VisualRequirements } from './visual-requirements.mjs';

const HISTORY_SIZE = 18;
export const ANATOMY_PLAN_VERSION = 4;
const optionalChoice = choices => z.enum(Object.keys(choices)).nullable();
export const AnatomyPlan = z.object({
  version: z.literal(ANATOMY_PLAN_VERSION),
  seed: z.string().min(1).max(100),
  inspirationIds: z.array(z.enum(animalTypeIds)).max(3).refine(ids => new Set(ids).size === ids.length),
  portrait: z.object({
    viewpoint: optionalChoice(viewpoints), encounter: optionalChoice(encounters), composition: optionalChoice(compositions),
  }).strict(),
  silhouette: optionalChoice(biologicalSilhouettes),
  challenge: z.enum(biologicalChallenges).nullable(),
  family: z.null(),
  anatomy: z.null(),
}).strict();

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

function selectInspirations(settings, recent, random) {
  const selected = settings.animalTypes ?? [];
  if (settings.directionLocks?.inspirations) return [...selected];
  if (settings.intent === 'literal' && settings.prompt?.trim() && !selected.length) return [];
  const pool = selected.length ? selected : animalTypes.map(type => type.id);
  const count = Math.min(pool.length, [1, 1, 2, 2, 3][Math.floor(random() * 5)]);
  const used = recent.flatMap(item => item.variation?.inspirationIds ?? []);
  const ids = [];
  for (let index = 0; index < count; index++) {
    // Unrestricted rolls start from real animal biology; fictional-only selections remain valid.
    const options = pool.filter(id => !ids.includes(id) && (selected.length || index > 0 || !animalTypeById[id].fictional));
    ids.push(balancedChoice(options, used, random));
  }
  return ids;
}

export function createAnatomyPlan(settings, seed, specimens = []) {
  const random = seededRandom(seed);
  const recent = specimens.filter(item => !item.demo).slice(0, HISTORY_SIZE);
  const literal = settings.intent === 'literal' && Boolean(settings.prompt?.trim());
  const wildlife = (settings.compositionMode ?? 'wildlife') === 'wildlife';
  const locks = settings.directionLocks ?? {};
  const inspirationIds = selectInspirations(settings, recent, random);
  const previousView = recent.find(item => item.variation?.portrait?.viewpoint)?.variation.portrait.viewpoint;
  const portrait = {
    viewpoint: locks.viewpoint ?? (literal ? null : balancedChoice(Object.keys(viewpoints).filter(id => id !== previousView),
      recent.map(item => item.variation?.portrait?.viewpoint), random)),
    encounter: locks.encounter ?? (!wildlife || literal ? null : balancedChoice(Object.keys(encounters),
      recent.map(item => item.variation?.portrait?.encounter), random)),
    composition: wildlife ? balancedChoice(Object.keys(compositions), recent.map(item => item.variation?.portrait?.composition), random) : null,
  };
  const silhouette = locks.silhouette ?? (literal ? null : balancedChoice(Object.keys(biologicalSilhouettes),
    recent.map(item => item.variation?.silhouette), random));
  const challenge = literal ? null : balancedChoice(biologicalChallenges, recent.map(item => item.variation?.challenge), random);
  return AnatomyPlan.parse({ version: ANATOMY_PLAN_VERSION, seed: String(seed), inspirationIds, portrait, silhouette, challenge, family: null, anatomy: null });
}

export function isPlanCompatible(settings, value) {
  const result = AnatomyPlan.safeParse(value);
  if (!result.success) return false;
  const plan = result.data, locks = settings.directionLocks ?? {}, selected = settings.animalTypes ?? [];
  if (selected.length && plan.inspirationIds.some(id => !selected.includes(id))) return false;
  if (locks.inspirations && (plan.inspirationIds.length !== selected.length || selected.some(id => !plan.inspirationIds.includes(id)))) return false;
  for (const key of ['viewpoint', 'encounter']) if (locks[key] && plan.portrait[key] !== locks[key]) return false;
  if (locks.silhouette && plan.silhouette !== locks.silhouette) return false;
  if ((settings.compositionMode ?? 'wildlife') !== 'wildlife' && plan.portrait.composition !== null) return false;
  if (settings.intent === 'literal' && settings.prompt?.trim()) {
    if (!selected.length && plan.inspirationIds.length) return false;
    if ((!locks.silhouette && plan.silhouette) || plan.challenge) return false;
    if ((!locks.viewpoint && plan.portrait.viewpoint) || (!locks.encounter && plan.portrait.encounter)) return false;
  }
  return true;
}

export function parseAnatomyPlan(value, settings) {
  const plan = AnatomyPlan.parse(value);
  if (settings && !isPlanCompatible(settings, plan)) throw new Error('Preview directions no longer match these settings. Preview them again.');
  return plan;
}

export function generationOutputSchema(validation) {
  const schema = z.toJSONSchema(validation, { target: 'draft-7' });
  delete schema.$schema;
  const replaceConstants = value => {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'const')) { value.enum = [value.const]; delete value.const; }
    for (const child of Object.values(value)) replaceConstants(child);
  };
  replaceConstants(schema);
  return schema;
}

export function plannedDesign(settings, plan) {
  const biology = settings.legless ? Biology.extend({ legCount: z.literal(0) }) : Biology;
  const requirements = VisualRequirements.extend({ originalPrompt: z.literal(settings.prompt ?? ''),
    required: InputVisualFeatures, excluded: InputVisualFeatures });
  const validation = GenerationSpecimen.extend({ biology, visualRequirements: requirements });
  return {
    prompt: creaturePrompt(settings, plan), schema: generationOutputSchema(validation),
    parse(data) {
      const parsed = validation.parse(data);
      return { ...parsed, visualRequirements: createVisualRequirements(settings, parsed.visualRequirements) };
    },
  };
}
