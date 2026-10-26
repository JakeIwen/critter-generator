import { portraitVersionOf, MODEL_ASSET_NAMES } from '../shared/specimen-assets.mjs';

export async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-Critter-Request': '1', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The server could not complete this request.');
  return body;
}

export function specimenFile(specimen, name, download = false) {
  const query = new URLSearchParams();
  if (download) query.set('download', '1');
  if (name === 'portrait.png') query.set('v', String(portraitVersionOf(specimen)));
  if (specimen.print?.assetRevision && MODEL_ASSET_NAMES.includes(name)) query.set('model', specimen.print.assetRevision);
  return `/api/specimens/${encodeURIComponent(specimen.id)}/files/${name}${query.size ? `?${query}` : ''}`;
}
