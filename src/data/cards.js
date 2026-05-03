import { COLOUR_ORDER } from './colours.js'

// Each project card: owner contributes ownerDice (exact values), dep player contributes depDice.
// "owner" colour is whichever player takes ownership — grey in the physical cards.
// urgentPenalty: points deducted per round from the round after drawing until delivery (inclusive).

const PROJECT_TEMPLATE = [
  { ownerDice: [6],    depDice: [1, 1], points: 10, urgentPenalty: 1 },
  { ownerDice: [5, 5], depDice: [2],    points: 8,  urgentPenalty: 0 },
  { ownerDice: [4, 4], depDice: [3],    points: 8,  urgentPenalty: 1 },
  { ownerDice: [3],    depDice: [4],    points: 5,  urgentPenalty: 0 },
  { ownerDice: [2],    depDice: [5],    points: 5,  urgentPenalty: 2 },
  { ownerDice: [1],    depDice: [6, 6], points: 10, urgentPenalty: 0 },
]

export const PROJECT_CARDS = COLOUR_ORDER.flatMap((colour, ci) =>
  PROJECT_TEMPLATE.map((template, ti) => ({
    id: `project-${colour}-${ti + 1}`,
    type: 'project',
    depColour: colour,
    ownerDice: template.ownerDice,
    depDice: template.depDice,
    points: template.points,
    urgentPenalty: template.urgentPenalty,
  }))
)

// Side project cards — one set of 6, always available.
// Any number of dice can be allocated; player scores 1pt per 6 rolled.
export const SIDE_PROJECT_CARDS = Array.from({ length: 6 }, (_, i) => ({
  id: `side-${i + 1}`,
  type: 'sideProject',
}))

// Training cards — 3 types × 3 copies each, always available face-up.
// Completed with own-colour dice only. Values are minimums (≥ threshold).
//   rework:  2 dice showing ≥ 4  → ability: reroll 2 dice once per round
//   support: 3 dice showing ≥ 4  → ability: use dice as any colour
//   set:     3 dice showing ≥ 5  → ability: set 1 die without rolling
export const TRAINING_DEFINITIONS = {
  rework: {
    id: 'rework',
    type: 'training',
    label: 'Rework',
    flavour: 'I know this other method that might work',
    ability: 'Once per round you may reroll two of your dice',
    requiredCount: 2,
    requiredMin: 4,
  },
  support: {
    id: 'support',
    type: 'training',
    label: 'Support',
    flavour: "You've broadened your horizon and have become expert enablers!",
    ability: 'You may use your dice as if they were a different colour to support another project',
    requiredCount: 3,
    requiredMin: 4,
  },
  set: {
    id: 'set',
    type: 'training',
    label: 'Set',
    flavour: "You've automated some repetitive tasks and got some serious edge!",
    ability: 'You may set one of your dice without rolling',
    slots: [6, 5, 4],  // one die ≥6, one ≥5, one ≥4 — greedy match, E≈3 rounds
  },
}

export const TRAINING_CARDS = ['rework', 'support', 'set'].flatMap((key, ki) =>
  Array.from({ length: 3 }, (_, ci) => ({
    ...TRAINING_DEFINITIONS[key],
    id: `training-${key}-${ci + 1}`,
  }))
)
