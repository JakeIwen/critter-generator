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

export function mountThemeToggle(group) {
  if (!group) return;
  const buttons = [...group.querySelectorAll('[role="radio"]')];
  function syncButtons() {
    for (const button of buttons) {
      const checked = button.dataset.theme === document.documentElement.dataset.theme;
      button.setAttribute('aria-checked', String(checked));
      button.tabIndex = checked ? 0 : -1;
    }
  }
  function choose(button) {
    const theme = button.dataset.theme;
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Switching still works when browser storage is unavailable or full.
    }
    syncButtons();
  }
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => choose(button));
    button.addEventListener('keydown', event => {
      const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (!direction) return;
      event.preventDefault();
      const next = buttons[(index + direction + buttons.length) % buttons.length];
      choose(next); next.focus();
    });
  });
  syncButtons();
}
