export const iconPaths = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/>',
  cube: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5M12 13 3 8m9 5v9"/>',
  sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  leaf: '<path d="M20 3C7 1 1 9 6 17s17 0 14-14ZM5 20 16 9"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
};

export const presets = {
  gentle: { absurdity: 15, deviancy: 10, femme: 30, psychedelic: 10, lethality: 5, prompt: 'A gentle forest grazer with one surprising adaptation.' },
  weird: { absurdity: 95, deviancy: 80, femme: 70, psychedelic: 90, lethality: 25, prompt: 'A delightfully ridiculous creature with inexplicably elaborate courtship rituals.' },
  danger: { absurdity: 60, deviancy: 35, femme: 15, psychedelic: 20, lethality: 95, prompt: 'A small but intimidating cave predator with imposing horns and dorsal armor.' },
};

export const stageTitles = {
  design: 'Discovering a new species',
  model: 'Bringing it into three dimensions',
  image: 'Putting a face to the name',
  done: 'Discovery complete',
};
