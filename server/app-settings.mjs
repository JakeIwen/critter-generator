import { z } from 'zod';
import { APP_SETTINGS, DEFAULT_APP_SETTINGS } from '../shared/app-settings.mjs';

export const Effort = z.string().regex(/^[a-z][a-z0-9_-]{0,29}$/);
const fieldSchemas = Object.fromEntries(Object.entries(APP_SETTINGS).map(([key, definition]) => [key,
  Array.isArray(definition.default) ? z.array(Effort)
    : z.number().int().min(definition.min).max(definition.max).multipleOf(definition.step)]));
export const AppSettings = z.object(fieldSchemas).strict();

export function mergeAppSettings(stored) {
  return Object.fromEntries(Object.entries(fieldSchemas).map(([key, schema]) => {
    const parsed = schema.safeParse(stored?.[key]);
    return [key, parsed.success ? parsed.data : structuredClone(DEFAULT_APP_SETTINGS[key])];
  }));
}
