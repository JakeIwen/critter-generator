import test from 'node:test';
import assert from 'node:assert/strict';
import { mountRouter } from '../src/router.js';

function browser(t, pathname = '/') {
  const originals = Object.fromEntries(['document', 'window', 'history', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = {}, writes = [], selected = [], toasts = [];
  const nodes = Object.fromEntries(['laboratory', 'collection', 'settings'].map(id => {
    const classes = new Set();
    return [id, { classList: { toggle(name, value) { if (value) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) } }];
  }));
  const location = { origin: 'http://localhost', pathname, search: '', hash: '' };
  const document = { title: 'Laboratory title', querySelectorAll: () => [], addEventListener: (name, fn) => { listeners[name] = fn; } };
  const window = { addEventListener: (name, fn) => { listeners[name] = fn; } };
  const history = Object.fromEntries(['pushState', 'replaceState'].map(method => [method, (_state, _title, path) => { writes.push([method, path]); location.pathname = path; }]));
  for (const [key, value] of Object.entries({ document, window, history, location })) Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  let specimens = [{ id: 'first', englishName: 'First' }, { id: 'second', englishName: 'Second' }], settingsCalls = 0;
  const router = mountRouter(id => nodes[id], {
    getSpecimens: () => specimens,
    specimenView: { select: specimen => selected.push(['select', specimen.id]), selectPortrait: specimen => selected.push(['portrait', specimen.id]) },
    showCollection() {}, settingsPage: { show() { settingsCalls++; } }, toast: message => toasts.push(message),
  });
  const click = (path, options = {}) => {
    let prevented = false;
    const link = { href: location.origin + path, hasAttribute: () => false };
    listeners.click({ target: { closest: () => link }, button: 0, preventDefault() { prevented = true; }, ...options });
    return prevented;
  };
  return { router, location, document, writes, nodes, selected, toasts, click,
    pop(path) { location.pathname = path; listeners.popstate(); },
    setSpecimens(value) { specimens = value; }, get settingsCalls() { return settingsCalls; } };
}

test('navigation pushes URLs, popstate renders without writes, and deep links select the specimen', t => {
  const view = browser(t, '/specimens/second');
  view.router.refresh();
  assert.equal(view.selected.at(-1)[1], 'second');
  assert.equal(view.document.title, 'Second · Critter Generator');
  assert.equal(view.click('/collection'), true);
  assert.deepEqual(view.writes.at(-1), ['pushState', '/collection']);
  assert.equal(view.nodes.collection.classList.contains('hidden'), false);
  view.router.setOwner(true); view.click('/settings');
  assert.equal(view.settingsCalls, 1);
  const count = view.writes.length;
  view.pop('/specimens/second');
  assert.equal(view.selected.at(-1)[1], 'second'); assert.equal(view.writes.length, count);
  view.pop('/'); assert.equal(view.document.title, 'Laboratory title');
  assert.equal(view.selected.at(-1)[1], 'first');
});

test('settings waits for owner status and never calls its API for a non-owner', t => {
  const view = browser(t, '/settings'); view.router.refresh();
  assert.equal(view.settingsCalls, 0);
  assert.equal(view.nodes.settings.classList.contains('hidden'), true);
  view.router.setOwner(false);
  assert.equal(view.settingsCalls, 0); assert.equal(view.location.pathname, '/');
  assert.deepEqual(view.writes, [['replaceState', '/']]);
});

test('owner deep links show Settings only after authorization', t => {
  const view = browser(t, '/settings'); view.router.refresh(); view.router.setOwner(true);
  assert.equal(view.nodes.settings.classList.contains('hidden'), false);
  assert.equal(view.settingsCalls, 1); assert.deepEqual(view.writes, []);
});

test('normalization, unknown specimens and automatic selection replace entries', t => {
  const view = browser(t, '/index.html');
  assert.deepEqual(view.writes, [['replaceState', '/']]);
  view.router.refresh(); view.click('/specimens/missing');
  assert.deepEqual(view.writes.slice(-2), [['pushState', '/specimens/missing'], ['replaceState', '/']]);
  assert.match(view.toasts[0], /not found/);
  view.router.refresh('second');
  assert.deepEqual(view.writes.at(-1), ['replaceState', '/specimens/second']);
  assert.equal(view.selected.at(-1)[0], 'select', 'automatic refresh preserves the CAD/portrait tab');
  view.click('/collection'); const count = view.writes.length;
  view.router.refresh('first');
  assert.equal(view.location.pathname, '/collection'); assert.equal(view.writes.length, count);
});

test('modified clicks, middle clicks and links with native targets stay native', t => {
  const view = browser(t);
  for (const options of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    assert.equal(view.click('/collection', options), false);
  }
  assert.equal(view.location.pathname, '/'); assert.deepEqual(view.writes, []);
});
