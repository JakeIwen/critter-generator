export const PORTRAIT_KINDS = Object.freeze({ GENERATION: 'generation', REGENERATE: 'regenerate', EDIT: 'edit' });
export const MODEL_ASSET_NAMES = Object.freeze(['model.stl', 'model.scad', 'mesh.json']);

export function portraitVersionOf(specimen) {
  return Number.isSafeInteger(specimen.portraitVersion) && specimen.portraitVersion > 0
    ? specimen.portraitVersion : specimen.image ? 1 : 0;
}

export function portraitFilename(version) {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Invalid portrait version.');
  return `portraits/${version}.png`;
}

export function cadIsStale(specimen) {
  if (!specimen.print) return false;
  return specimen.print.stale === true ||
    (specimen.print.sourcePortraitVersion ?? 1) !== portraitVersionOf(specimen);
}

export function modelFilename(specimen, name) {
  if (!MODEL_ASSET_NAMES.includes(name)) throw new Error('Invalid model asset.');
  const revision = specimen.print?.assetRevision;
  if (!revision) return name;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(revision)) throw new Error('Invalid model revision.');
  return `models/${revision}/${name}`;
}
