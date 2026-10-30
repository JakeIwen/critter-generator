import assert from 'node:assert/strict';
import test from 'node:test';
import { portraitVersionsFor, renderImageReview, renderSpecimenActions } from '../src/specimen-actions.js';
import { specimenFile } from '../src/api.js';

test('legacy and versioned portraits retain stable, distinct download links', () => {
  const legacy = portraitVersionsFor({ id: 'saved-one', image: true });
  assert.deepEqual(legacy.map(({ version, current, url }) => ({ version, current, url })), [
    { version: 1, current: true, url: '/api/specimens/saved-one/portraits/1.png?download=1' },
  ]);
  const history = portraitVersionsFor({ id: 'saved-one', image: true, portraitVersion: 3,
    portraits: [{ version: 1, kind: 'generation' }, { version: 2, kind: 'edit', instructions: 'Orange fur' }, { version: 3, kind: 'regenerate' }] });
  assert.deepEqual(history.map(({ version, current }) => [version, current]), [[3, true], [2, false], [1, false]]);
  assert.equal(history[1].instructions, 'Orange fur');
  assert.equal(history[2].url, legacy[0].url);
  assert.deepEqual(portraitVersionsFor({ id: 'missing', image: false }), []);
});

test('updated portraits and CAD revisions get new URLs without changing stable asset routes', () => {
  const specimen = { id: 'saved-one', image: true, portraitVersion: 2, print: { assetRevision: 'revision-one' } };
  assert.equal(specimenFile(specimen, 'portrait.png'), '/api/specimens/saved-one/files/portrait.png?v=2');
  assert.equal(specimenFile(specimen, 'model.stl', true), '/api/specimens/saved-one/files/model.stl?download=1&model=revision-one');
  assert.equal(specimenFile(specimen, 'record.json', true), '/api/specimens/saved-one/files/record.json?download=1');
  assert.notEqual(specimenFile(specimen, 'portrait.png'), specimenFile({ ...specimen, portraitVersion: 3 }, 'portrait.png'));
});

test('advisory review displays uncertainty and escapes model-provided observations', () => {
  const review = renderImageReview({ status: 'reviewed', issues: [
    { requirement: 'Four legs', status: 'uncertain', observation: 'Two legs are behind a rock.' },
    { requirement: 'No wings', status: 'conflict', observation: '<script>alert(1)</script>' },
  ] });
  assert.match(review, /2 items to inspect/);
  assert.match(review, /Two legs are behind a rock/);
  assert.match(review, /&lt;script&gt;/);
  assert.doesNotMatch(review, /<script>/);
  assert.match(renderImageReview({ status: 'unavailable' }), /The portrait was saved/);
  assert.equal(renderImageReview(null), '');
});

function actionView(specimen, busy = false) {
  const nodes = {}, calls = [];
  const host = { classList: { toggle() {} }, querySelectorAll: () => Object.values(nodes),
    set innerHTML(markup) {
      this.markup = markup;
      for (const match of markup.matchAll(/id="([^"]+)"/g)) nodes[match[1]] = {};
    },
  };
  const byId = id => id === 'specimen-actions' ? host : nodes[id];
  renderSpecimenActions(byId, specimen, { busy, onPortrait: (...args) => calls.push(['portrait', ...args]),
    onCad: (...args) => calls.push(['cad', ...args]), onViewModel: () => calls.push(['model']) });
  return { host, nodes, calls };
}

test('CAD card keeps validated form settings and adds a model next step only when a model exists', () => {
  const specimen = { id: 'saved', image: true, settings: { height: 100 } };
  const idle = actionView(specimen);
  assert.match(idle.host.markup, /Not generated/); assert.equal(idle.nodes['view-cad'], undefined);
  idle.nodes['cad-height'].value = '120'; idle.nodes['cad-baseplate'].checked = false;
  idle.nodes['cad-form'].onsubmit({ preventDefault() {} });
  assert.deepEqual(idle.calls, [['cad', specimen, { height: 120, baseplate: false }]]);
  for (const design of [{ anatomy: {} }, { anatomy: null, sculpt: { parts: [] } }]) {
    const ready = actionView({ ...specimen, ...design, print: { height: 120, sourcePortraitVersion: 1 } });
    assert.match(ready.host.markup, /Matches portrait/); assert.match(ready.host.markup, /View 3D model/);
    ready.nodes['view-cad'].onclick(); assert.deepEqual(ready.calls, [['model']]);
  }
  const failed = actionView({ ...specimen, cadError: 'Could not build <solid>' });
  assert.match(failed.host.markup, /CAD incomplete: Could not build &lt;solid&gt;/);
  assert.equal(failed.nodes['generate-cad'].disabled, false);
  const busy = actionView(specimen, true); assert.equal(busy.nodes['generate-cad'].disabled, true);
});
