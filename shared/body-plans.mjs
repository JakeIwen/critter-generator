// Semi-axis ranges keep each family recognisable while allowing many proportions.
export const bodyPlans = {
  ribbon: { bodyLength: [34, 42], bodyWidth: [9, 12], bodyHeight: [8, 11], headSize: [8, 11], neckLength: [0, 4] },
  shield: { bodyLength: [20, 27], bodyWidth: [21, 25], bodyHeight: [8, 11], headSize: [9, 13], neckLength: [0, 3] },
  dome: { bodyLength: [18, 23], bodyWidth: [18, 23], bodyHeight: [20, 26], headSize: [8, 12], neckLength: [0, 4] },
  prow: { bodyLength: [28, 35], bodyWidth: [12, 16], bodyHeight: [13, 17], headSize: [13, 16], neckLength: [0, 4] },
  pebble: { bodyLength: [18, 22], bodyWidth: [12, 16], bodyHeight: [12, 16], headSize: [13, 16], neckLength: [0, 4] },
  highShouldered: { bodyLength: [22, 28], bodyWidth: [12, 16], bodyHeight: [20, 24], headSize: [9, 13], neckLength: [6, 10] },
};

export const shapeRanges = {
  headWidth: [.7, 1.4], headDepth: [.7, 1.5], headHeight: [.65, 1.25],
  stanceWidth: [.85, 1.3], hornSweep: [-1, 1], legLength: [0, 6],
  hornLength: [4, 16], tailCurl: [-1, 1],
};
