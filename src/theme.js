import { icon } from './icons.js';

const THEME_STORAGE_KEY = 'critter-theme';
// Hex mirrors of style.css --bg for browser metadata; the contrast test guards them.
export const THEME_BACKGROUND = { dark: '#16121b', light: '#f6f4fa' };

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BACKGROUND[theme]);
}

export function applyStoredTheme() {
  let theme = 'dark';
  try {
    if (localStorage.getItem(THEME_STORAGE_KEY) === 'light') theme = 'light';
  } catch {
    // Blocked storage must not prevent the default theme or app from rendering.
  }
  applyTheme(theme);
}

export function mountThemeToggle(button) {
  if (!button) return;
  function syncButton() {
    const light = document.documentElement.dataset.theme === 'light';
    const label = `Switch to ${light ? 'dark' : 'light'} theme`;
    button.setAttribute('aria-pressed', String(light));
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.innerHTML = icon(light ? 'moon' : 'sun', 16);
  }
  button.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Switching still works when browser storage is unavailable or full.
    }
    syncButton();
  });
  syncButton();
}
