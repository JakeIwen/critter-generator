// The personality sliders, in display order. The server's settings schema,
// the generation prompt, and the browser form are all built from this list.
// No zod here: the browser bundle imports it too.
export const sliders = [
  { id: 'absurdity', name: 'Absurdity', short: 'A', initial: 65, low: 'Almost plausible', high: 'Nature gave up',
    hint: 'The extent to which this creature defies sensible evolution.' },
  { id: 'deviancy', name: 'Sexual deviancy', short: 'D', initial: 35, low: 'Conventional', high: 'Deeply peculiar',
    hint: 'Bizarre courtship & reproductive biology. Non-graphic.' },
  { id: 'femme', name: 'Femme', short: 'F', initial: 40, low: 'Rugged', high: 'Exquisitely femme',
    hint: 'Grace, ornament and flair: frills, lashes, jewel tones, elegant poise.' },
  { id: 'psychedelic', name: 'Psychedelic', short: 'P', initial: 25, low: 'Field-guide drab', high: 'Full kaleidoscope',
    hint: 'Fluorescent color, hypnotic patterns and mind-bending behavior.' },
  { id: 'lethality', name: 'Lethality', short: 'L', initial: 20, low: 'Pocket companion', high: 'Apex nightmare',
    hint: 'How dangerous this fictional animal is.' },
];
