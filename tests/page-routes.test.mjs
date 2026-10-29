import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_PATHS, parsePagePath, formatPagePath, isAppPagePath } from '../shared/page-routes.mjs';

for (const [page, pathname] of Object.entries(PAGE_PATHS)) {
  test(`${page} page paths round trip`, () => {
    const route = { page, specimenId: null };
    assert.deepEqual(parsePagePath(pathname), route);
    assert.equal(formatPagePath(route), pathname);
    assert.equal(isAppPagePath(pathname), page !== 'logout');
  });
}

for (const specimenId of ['example-lantern', 'reef hunter', 'a/b?c#d%é']) {
  test(`specimen ${specimenId} round trips through URL encoding`, () => {
    const route = { page: 'lab', specimenId };
    const pathname = formatPagePath(route);
    assert.deepEqual(parsePagePath(pathname), route);
    assert.equal(isAppPagePath(pathname), true);
  });
}

test('normalizes index and trailing slashes but rejects unknown or malformed paths', () => {
  assert.equal(formatPagePath(parsePagePath('/index.html')), '/');
  assert.equal(formatPagePath(parsePagePath('/collection/')), '/collection');
  for (const pathname of ['/unknown', '/api/status', '/specimens/', '/specimens/a/b', '/specimens/%ZZ', '/collection/other']) {
    assert.equal(parsePagePath(pathname), null, pathname);
    assert.equal(isAppPagePath(pathname), false, pathname);
  }
  assert.throws(() => formatPagePath({ page: 'unknown' }), TypeError);
  assert.throws(() => formatPagePath({ page: 'collection', specimenId: 'a' }), TypeError);
  assert.throws(() => formatPagePath({ page: 'lab', specimenId: '' }), TypeError);
});
