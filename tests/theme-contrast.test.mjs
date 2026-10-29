import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { THEME_BACKGROUND, applyStoredTheme, mountThemeToggle } from '../src/theme.js';
import { icon } from '../src/icons.js';

const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
const declarations = block => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value]));
const base = declarations(css.match(/:root \{([^}]+)\}/s)[1]);
const light = declarations(css.match(/:root\[data-theme="light"\] \{([^}]+)\}/s)[1]);

function linearRgb(tokens, name) {
  const value = tokens[name];
  if (value.startsWith('var(')) return linearRgb(tokens, value.slice(4, -1));
  const match = value.match(/^oklch\(([\d.]+) calc\(([\d.]+) \* var\(--chroma\)\) (?:var\((--hue-[\w]+)\)|([\d.]+))\)$/);
  assert.ok(match, `Unsupported color for ${name}: ${value}`);
  const [, lightness, scale, hueToken, fixedHue] = match;
  const l = Number(lightness), chroma = Number(scale) * Number(tokens['--chroma']);
  const hue = Number(hueToken ? tokens[hueToken] : fixedHue) * Math.PI / 180;
  const a = chroma * Math.cos(hue), b = chroma * Math.sin(hue);
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.7076147010 * short,
  ].map(channel => Math.max(0, Math.min(1, channel)));
}

function contrast(a, b) {
  const luminance = ([r, g, blue]) => 0.2126 * r + 0.7152 * g + 0.0722 * blue;
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

for (const [theme, tokens] of Object.entries({ dark: base, light: { ...base, ...light } })) {
  test(`${theme} palette keeps body, muted and button text at WCAG AA`, () => {
    for (const [foreground, background] of [['--text', '--bg'], ['--text', '--surface'], ['--muted', '--bg'], ['--muted', '--surface'], ['--on-accent', '--accent']]) {
      const ratio = contrast(linearRgb(tokens, foreground), linearRgb(tokens, background));
      assert.ok(ratio >= 4.5, `${theme} ${foreground} on ${background}: ${ratio.toFixed(2)}:1`);
    }
  });
  test(`${theme} browser theme color mirrors the stylesheet background`, () => {
    const rgb = linearRgb(tokens, '--bg').map(channel => 255 * (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055));
    const mirror = THEME_BACKGROUND[theme].slice(1).match(/../g).map(channel => parseInt(channel, 16));
    rgb.forEach((channel, index) => assert.ok(Math.abs(channel - mirror[index]) < 1.5, `${theme} channel ${index} differs`));
  });
}

function browserFixture(t, stored, blocked = false) {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const attributes = new Map(), storage = new Map(stored === undefined ? [] : [['critter-theme', stored]]);
  let click;
  const meta = { setAttribute(name, value) { this[name] = value; } };
  const button = { setAttribute: (name, value) => attributes.set(name, value), addEventListener: (name, fn) => { assert.equal(name, 'click'); click = fn; } };
  const document = { documentElement: { dataset: {} }, querySelector: selector => { assert.equal(selector, 'meta[name="theme-color"]'); return meta; } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() {
    if (blocked) throw new Error('Storage denied');
    return { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  } });
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete globalThis.document;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage); else delete globalThis.localStorage;
  });
  return { document, meta, button, attributes, storage, click: () => click() };
}

for (const stored of [undefined, 'invalid', 'dark', 'light']) {
  test(`stored theme ${stored ?? '(missing)'} applies a valid theme and accessible button`, t => {
    const view = browserFixture(t, stored);
    applyStoredTheme();
    mountThemeToggle(view.button);
    const theme = stored === 'light' ? 'light' : 'dark';
    assert.equal(view.document.documentElement.dataset.theme, theme);
    assert.equal(view.meta.content, THEME_BACKGROUND[theme]);
    assert.equal(view.attributes.get('aria-pressed'), String(theme === 'light'));
    assert.equal(view.attributes.get('aria-label'), `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`);
    assert.equal(view.attributes.get('title'), view.attributes.get('aria-label'));
    assert.equal(view.button.innerHTML, icon(theme === 'light' ? 'moon' : 'sun', 16));
  });
}

test('toggle persists each theme and keeps metadata, icon and accessible name synchronized', t => {
  const view = browserFixture(t);
  applyStoredTheme(); mountThemeToggle(view.button);
  for (const theme of ['light', 'dark']) {
    view.click();
    assert.equal(view.document.documentElement.dataset.theme, theme);
    assert.equal(view.storage.get('critter-theme'), theme);
    assert.equal(view.meta.content, THEME_BACKGROUND[theme]);
    assert.equal(view.attributes.get('aria-pressed'), String(theme === 'light'));
    assert.equal(view.attributes.get('aria-label'), `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`);
    assert.equal(view.button.innerHTML, icon(theme === 'light' ? 'moon' : 'sun', 16));
    applyStoredTheme();
    assert.equal(view.document.documentElement.dataset.theme, theme);
  }
});

test('blocked storage keeps startup and theme switching usable', t => {
  const view = browserFixture(t, undefined, true);
  applyStoredTheme(); mountThemeToggle(view.button);
  assert.equal(view.document.documentElement.dataset.theme, 'dark');
  view.click();
  assert.equal(view.document.documentElement.dataset.theme, 'light');
  assert.equal(view.attributes.get('aria-label'), 'Switch to dark theme');
  assert.doesNotThrow(() => mountThemeToggle(null));
});
