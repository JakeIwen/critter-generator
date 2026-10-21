export async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-Critter-Request': '1', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The server could not complete this request.');
  return body;
}

export function specimenFile(specimen, name, download = false) {
  return `/api/specimens/${encodeURIComponent(specimen.id)}/files/${name}${download ? '?download=1' : ''}`;
}
