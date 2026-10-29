const iconPaths = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
  moon: '<path d="M20.9 13.1A9 9 0 0 1 10.9 3.1a9 9 0 1 0 10 10Z"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/>',
  cube: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5M12 13 3 8m9 5v9"/>',
  sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  // Brand mark: a three-eyed fish, the lab's mascot for species that never existed.
  fish: '<path d="M5 12c2.5-4 5.5-6 9-6 3 0 5.5 1.5 7.5 4L23 12l-1.5 2c-2 2.5-4.5 4-7.5 4-3.5 0-6.5-2-9-6Z"/><path d="M5 12 2 8.5v7L5 12Zm5-5.4L8.5 3.2l4.6 2.9"/><circle cx="15.8" cy="12.9" r="1.5"/><circle cx="19.4" cy="12.9" r="1.5"/><circle cx="17.6" cy="9.6" r="1.5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
};

export function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.sparkle}</svg>`;
}
