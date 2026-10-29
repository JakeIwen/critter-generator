export const PAGE_PATHS = Object.freeze({ lab: '/', collection: '/collection', settings: '/settings', logout: '/logout' });
const SPECIMEN_PREFIX = '/specimens/';
const pagesByPath = Object.fromEntries(Object.entries(PAGE_PATHS).map(([page, pathname]) => [pathname, page]));

export function parsePagePath(pathname) {
  const normalized = pathname === '/index.html' ? PAGE_PATHS.lab : pathname.replace(/\/$/, '') || PAGE_PATHS.lab;
  if (Object.hasOwn(pagesByPath, normalized)) return { page: pagesByPath[normalized], specimenId: null };
  if (!normalized.startsWith(SPECIMEN_PREFIX)) return null;
  const encoded = normalized.slice(SPECIMEN_PREFIX.length);
  if (!encoded || encoded.includes('/')) return null;
  try { return { page: 'lab', specimenId: decodeURIComponent(encoded) }; }
  catch { return null; }
}

export function formatPagePath({ page, specimenId = null }) {
  if (!Object.hasOwn(PAGE_PATHS, page) || (specimenId !== null && (page !== 'lab' || !String(specimenId)))) {
    throw new TypeError('Unknown page or invalid specimen route.');
  }
  return specimenId === null ? PAGE_PATHS[page] : SPECIMEN_PREFIX + encodeURIComponent(specimenId);
}

export function isAppPagePath(pathname) {
  const route = parsePagePath(pathname);
  return route !== null && route.page !== 'logout';
}
