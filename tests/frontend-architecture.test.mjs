import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
const imports = text => [...text.matchAll(/^import (?:.* from )?['"](.+)['"];?$/gm)].map(match => match[1]);

test('browser entry point only loads styles and delegates startup', async () => {
  const main = await source('main.js');
  assert.deepEqual(imports(main), ['./style.css', './studio.js', './theme.js']);
  assert.ok(main.split('\n').length <= 9, 'main.js must remain bootstrap-only: theme, studio, toggle wiring');
});

test('frontend features depend inward and the studio remains wiring', async () => {
  const featureFiles = ['api.js', 'router.js', 'collection.js', 'connection.js', 'generation-form.js', 'generation-directions.js', 'generation-jobs.js', 'icons.js', 'presets.js', 'settings-page.js', 'settings-format.js', 'specimen-format.js', 'specimen-view.js', 'specimen-actions.js', 'template.js', 'theme.js'];
  for (const file of featureFiles) {
    assert.ok(!(await source(file)).includes("from './studio.js'"), `${file} must not depend on the composition root`);
  }
  const studio = await source('studio.js');
  assert.ok(studio.split('\n').length <= 80, 'studio.js must remain a small composition root');
  assert.doesNotMatch(studio, /innerHTML\s*=/, 'feature markup belongs to its rendering owner');
});
