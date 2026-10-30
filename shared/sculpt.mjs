import { z } from 'zod';

export const SCULPT_KINDS = Object.freeze({ ELLIPSOID: 'ellipsoid', CAPSULE: 'capsule', HULL: 'hull' });
export const SCULPT_AXES = Object.freeze({ X: 'x', Y: 'y', Z: 'z' });
export const SCULPT_ROLES = Object.freeze({ BODY: 'body', LEG: 'walking-leg', DETAIL: 'detail' });
export const SCULPT_LIMITS = Object.freeze({ parts: 40, expandedParts: 120, coordinate: 150, radius: 80, repeats: 24, balls: 8 });
export const SCULPT_GROUND = 3;
const vector = limit => z.array(z.number().min(-limit).max(limit)).length(3);
const point = vector(SCULPT_LIMITS.coordinate);
const radius = z.number().min(.1).max(SCULPT_LIMITS.radius);
const ball = z.object({ center: point, radius }).strict();
const Part = z.object({
  kind: z.enum(Object.values(SCULPT_KINDS)),
  role: z.enum(Object.values(SCULPT_ROLES)).default(SCULPT_ROLES.BODY),
  center: point.nullable().default(null), radii: z.array(radius).length(3).nullable().default(null),
  rotation: vector(360).nullable().default(null),
  from: point.nullable().default(null), to: point.nullable().default(null),
  radius: radius.nullable().default(null), endRadius: radius.nullable().default(null),
  balls: z.array(ball).min(2).max(SCULPT_LIMITS.balls).nullable().default(null),
  accent: z.boolean().default(false), mirrorX: z.boolean().default(false),
  radial: z.object({ count: z.number().int().min(2).max(SCULPT_LIMITS.repeats),
    axis: z.enum(Object.values(SCULPT_AXES)), center: point }).strict().nullable().default(null),
}).strict();
const fields = {
  [SCULPT_KINDS.ELLIPSOID]: ['center', 'radii'],
  [SCULPT_KINDS.CAPSULE]: ['from', 'to', 'radius', 'endRadius'],
  [SCULPT_KINDS.HULL]: ['balls'],
};

// One object shape keeps strict structured output portable across both providers.
export const Sculpt = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  approximationNotes: z.array(z.string().min(3).max(350)).max(8),
  parts: z.array(Part).min(1).max(SCULPT_LIMITS.parts),
}).strict().superRefine((sculpt, ctx) => {
  let expanded = 0;
  sculpt.parts.forEach((part, i) => {
    expanded += (part.mirrorX ? 2 : 1) * (part.radial?.count ?? 1);
    for (const field of fields[part.kind]) if (part[field] === null) {
      ctx.addIssue({ code: 'custom', path: ['parts', i, field], message: `${part.kind} requires ${field}.` });
    }
    const allowed = [...fields[part.kind], ...(part.kind === SCULPT_KINDS.ELLIPSOID ? ['rotation'] : [])];
    for (const field of ['center', 'radii', 'rotation', 'from', 'to', 'radius', 'endRadius', 'balls']) {
      if (!allowed.includes(field) && part[field] !== null) ctx.addIssue({ code: 'custom', path: ['parts', i, field], message: `${field} must be null for ${part.kind}.` });
    }
  });
  if (expanded > SCULPT_LIMITS.expandedParts) ctx.addIssue({ code: 'custom', path: ['parts'], message: `At most ${SCULPT_LIMITS.expandedParts} expanded parts are allowed (got ${expanded}).` });
});

export function sculptValidation(legless = false) {
  return Sculpt.superRefine((sculpt, ctx) => {
    if (legless && sculpt.parts.some(part => part.role === SCULPT_ROLES.LEG)) {
      ctx.addIssue({ code: 'custom', path: ['parts'], message: 'This organism is legless: no walking-leg parts are allowed. Fins and tentacles may be body or detail parts.' });
    }
  });
}
