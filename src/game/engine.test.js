import { describe, it, expect } from 'vitest'
import { gameReducer, matchDiceToSlots, matchTrainingDice } from './engine.js'
import { TRAINING_DEFINITIONS } from '../data/cards.js'

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeDie(id, overrides = {}) {
  return { id, value: null, allocatedTo: null, locked: false, ...overrides }
}

function makePlayer(id, colour, overrides = {}) {
  return {
    id,
    name: colour,
    colour,
    totalScore: 0,
    dice: Array.from({ length: 5 }, (_, i) => makeDie(`${colour}-${i}`)),
    ownedCards: [],
    pendingCards: [],
    activeTrainingCards: [],
    completedTrainings: [],
    reworkUsed: false,
    setDieUsed: false,
    needsDraw: 0,
    ...overrides,
  }
}

function makeState(overrides = {}) {
  return {
    phase: 'work',
    round: 1,
    totalRounds: 12,
    gameOver: false,
    teamScore: 0,
    planReadyPlayers: [],
    players: [],
    deck: [],
    marketplace: [],
    roundScores: [],
    ...overrides,
  }
}

// ─── matchDiceToSlots ─────────────────────────────────────────────────────────

describe('matchDiceToSlots', () => {
  let n = 0
  function entry(value, locked = false) {
    return { die: { id: `d${n++}`, value, locked }, player: {} }
  }

  it('locks all dice when every slot is exactly matched', () => {
    const r = matchDiceToSlots([5, 5], [entry(5), entry(5)])
    expect(r.allSatisfied).toBe(true)
    expect(r.tolock).toHaveLength(2)
    expect(r.tofree).toHaveLength(0)
  })

  it('frees dice that do not match any slot', () => {
    const r = matchDiceToSlots([5], [entry(5), entry(3)])
    expect(r.allSatisfied).toBe(true)
    expect(r.tolock).toHaveLength(1)
    expect(r.tofree).toHaveLength(1)
  })

  it('allSatisfied is false when a slot cannot be filled', () => {
    const r = matchDiceToSlots([5, 5], [entry(5)])
    expect(r.allSatisfied).toBe(false)
    expect(r.tolock).toHaveLength(1)
    expect(r.tofree).toHaveLength(0)
  })

  it('pre-matched locked dice reduce the remaining open slots', () => {
    // One slot [5] already covered by a locked die — only the second [5] needs a new lock
    const r = matchDiceToSlots([5, 5], [entry(5, true), entry(5)])
    expect(r.allSatisfied).toBe(true)
    expect(r.tolock).toHaveLength(1)  // only the newly matched die
  })

  it('all dice freed when requirements are empty', () => {
    const r = matchDiceToSlots([], [entry(5), entry(3)])
    expect(r.allSatisfied).toBe(true)
    expect(r.tolock).toHaveLength(0)
    expect(r.tofree).toHaveLength(2)
  })

  it('does not cross-match — each slot consumed by exactly one die', () => {
    // One die cannot satisfy two slots
    const r = matchDiceToSlots([5, 5], [entry(5)])
    expect(r.allSatisfied).toBe(false)
  })
})

// ─── matchTrainingDice ────────────────────────────────────────────────────────

describe('matchTrainingDice — set training (slots ≥6, ≥5, ≥4)', () => {
  const setDef = TRAINING_DEFINITIONS.set
  let n = 0
  function entry(value, locked = false) {
    return { die: { id: `d${n++}`, value, locked }, player: {} }
  }

  it('locks all 3 dice when all slots are satisfied', () => {
    const r = matchTrainingDice(setDef, [entry(6), entry(5), entry(4)])
    expect(r.tolock).toHaveLength(3)
  })

  it('partially locks only the ≥6 slot when only a 6 is rolled', () => {
    const r = matchTrainingDice(setDef, [entry(6)])
    expect(r.tolock).toHaveLength(1)
  })

  it('a 4 locks into the ≥4 slot (not consumed by ≥6 or ≥5)', () => {
    const r = matchTrainingDice(setDef, [entry(4)])
    expect(r.tolock).toHaveLength(1)
  })

  it('a 5 and a 4 lock into the ≥5 and ≥4 slots, leaving ≥6 open', () => {
    const r = matchTrainingDice(setDef, [entry(5), entry(4)])
    expect(r.tolock).toHaveLength(2)
  })

  it('skips already-locked dice (prior rounds)', () => {
    // 6 already locked — only the new 5 and 4 should be locked
    const r = matchTrainingDice(setDef, [entry(6, true), entry(5), entry(4)])
    expect(r.tolock).toHaveLength(2)
  })

  it('does not re-lock slots already covered by locked dice', () => {
    // ≥5 and ≥4 already locked from a prior round; only ≥6 remains open.
    // Extra unlocked 5s and 4s must NOT be locked again for those slots.
    const r = matchTrainingDice(setDef, [entry(5, true), entry(4, true), entry(5), entry(4), entry(3)])
    expect(r.tolock).toHaveLength(0)
  })

  it('locks only the remaining slot when prior dice cover easier slots', () => {
    // ≥5 and ≥4 already locked; a 6 is now rolled — should lock only that one
    const r = matchTrainingDice(setDef, [entry(5, true), entry(4, true), entry(6)])
    expect(r.tolock).toHaveLength(1)
  })

  it('locks nothing for a value below all slot minimums', () => {
    const r = matchTrainingDice(setDef, [entry(3)])
    expect(r.tolock).toHaveLength(0)
  })
})

describe('matchTrainingDice — rework training (2 dice ≥4)', () => {
  const reworkDef = TRAINING_DEFINITIONS.rework
  let n = 0
  function entry(value, locked = false) {
    return { die: { id: `d${n++}`, value, locked }, player: {} }
  }

  it('locks 2 dice when training is complete', () => {
    const r = matchTrainingDice(reworkDef, [entry(4), entry(5)])
    expect(r.tolock).toHaveLength(2)
  })

  it('partially locks 1 die when only 1 qualifies', () => {
    const r = matchTrainingDice(reworkDef, [entry(4), entry(3)])
    expect(r.tolock).toHaveLength(1)
  })

  it('does not lock more than requiredCount dice', () => {
    const r = matchTrainingDice(reworkDef, [entry(4), entry(5), entry(6)])
    expect(r.tolock).toHaveLength(2)
  })

  it('does not exceed requiredCount when partial progress exists from a prior round', () => {
    // 1 die already locked; only 1 more needed, even though 3 qualify
    const r = matchTrainingDice(reworkDef, [entry(5, true), entry(4), entry(5), entry(6)])
    expect(r.tolock).toHaveLength(1)
  })

  it('locks nothing when no dice qualify', () => {
    const r = matchTrainingDice(reworkDef, [entry(3), entry(2)])
    expect(r.tolock).toHaveLength(0)
  })
})

// ─── Allocation rules (via reducer) ──────────────────────────────────────────

describe('ALLOCATE_DIE', () => {
  it('cannot allocate a locked die', () => {
    const state = makeState({
      phase: 'plan',
      players: [makePlayer('p1', 'green', {
        ownedCards: [{ cardId: 'project-blue-2', drawnRound: 1 }],
        dice: [makeDie('green-0', { locked: true }), ...Array.from({ length: 4 }, (_, i) => makeDie(`green-${i + 1}`))],
      })],
    })
    const next = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: 'p1', dieId: 'green-0', cardId: 'project-blue-2' })
    expect(next.players[0].dice[0].allocatedTo).toBeNull()
  })

  it('cannot allocate a die that is already allocated', () => {
    const state = makeState({
      phase: 'plan',
      players: [makePlayer('p1', 'green', {
        ownedCards: [
          { cardId: 'project-blue-2', drawnRound: 1 },
          { cardId: 'project-blue-3', drawnRound: 1 },
        ],
        dice: [makeDie('green-0', { allocatedTo: 'project-blue-2' }), ...Array.from({ length: 4 }, (_, i) => makeDie(`green-${i + 1}`))],
      })],
    })
    const next = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: 'p1', dieId: 'green-0', cardId: 'project-blue-3' })
    expect(next.players[0].dice[0].allocatedTo).toBe('project-blue-2')
  })

  it('non-dep-colour player cannot contribute to a project without Support', () => {
    // project-blue-2 has depColour 'blue'; yellow player has no Support
    const state = makeState({
      phase: 'plan',
      players: [
        makePlayer('p1', 'green', { ownedCards: [{ cardId: 'project-blue-2', drawnRound: 1 }] }),
        makePlayer('p2', 'yellow'),
      ],
    })
    const next = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: 'p2', dieId: 'yellow-0', cardId: 'project-blue-2' })
    expect(next.players[1].dice[0].allocatedTo).toBeNull()
  })

  it('non-dep-colour player can contribute with Support training', () => {
    const state = makeState({
      phase: 'plan',
      players: [
        makePlayer('p1', 'green', { ownedCards: [{ cardId: 'project-blue-2', drawnRound: 1 }] }),
        makePlayer('p2', 'yellow', { completedTrainings: ['support'] }),
      ],
    })
    const next = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: 'p2', dieId: 'yellow-0', cardId: 'project-blue-2' })
    expect(next.players[1].dice[0].allocatedTo).toBe('project-blue-2')
  })
})

// ─── Set-phase auto-advance ───────────────────────────────────────────────────

describe('KEEP_CARD / PUT_TO_MARKETPLACE auto-advance', () => {
  it('advances to plan when the last player resolves their pending card via KEEP_CARD', () => {
    // project-blue-2: depColour 'blue', green can keep it
    const state = makeState({
      phase: 'set',
      players: [
        makePlayer('p1', 'green', { pendingCards: [{ cardId: 'project-blue-2', drawnRound: 1 }] }),
        makePlayer('p2', 'blue'),  // no pending cards
      ],
    })
    const next = gameReducer(state, { type: 'KEEP_CARD', playerId: 'p1', cardId: 'project-blue-2' })
    expect(next.phase).toBe('plan')
  })

  it('advances to plan when the last player resolves via PUT_TO_MARKETPLACE', () => {
    const state = makeState({
      phase: 'set',
      players: [
        makePlayer('p1', 'green', { pendingCards: [{ cardId: 'project-blue-2', drawnRound: 1 }] }),
        makePlayer('p2', 'blue'),
      ],
    })
    const next = gameReducer(state, { type: 'PUT_TO_MARKETPLACE', playerId: 'p1', cardId: 'project-blue-2' })
    expect(next.phase).toBe('plan')
  })

  it('stays in set phase while other players still have pending cards', () => {
    const state = makeState({
      phase: 'set',
      players: [
        makePlayer('p1', 'green', { pendingCards: [{ cardId: 'project-blue-2', drawnRound: 1 }] }),
        makePlayer('p2', 'blue',  { pendingCards: [{ cardId: 'project-green-2', drawnRound: 1 }] }),
      ],
    })
    const next = gameReducer(state, { type: 'KEEP_CARD', playerId: 'p1', cardId: 'project-blue-2' })
    expect(next.phase).toBe('set')
  })

  it('prevents keeping a project whose depColour matches own colour', () => {
    // project-green-2 has depColour 'green' — green player cannot keep it
    const state = makeState({
      phase: 'set',
      players: [makePlayer('p1', 'green', { pendingCards: [{ cardId: 'project-green-2', drawnRound: 1 }] })],
    })
    const next = gameReducer(state, { type: 'KEEP_CARD', playerId: 'p1', cardId: 'project-green-2' })
    expect(next.players[0].pendingCards).toHaveLength(1)
    expect(next.players[0].ownedCards).toHaveLength(0)
  })
})

// ─── Score phase — project delivery ──────────────────────────────────────────

describe('ADVANCE_TO_SCORE — project delivery', () => {
  // project-blue-2: ownerDice [5,5], depDice [2], points 8, urgentPenalty 0
  it('awards points and removes the card when all slots are matched', () => {
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          ownedCards: [{ cardId: 'project-blue-2', drawnRound: 1 }],
          dice: [
            makeDie('green-0', { value: 5, allocatedTo: 'project-blue-2', locked: true }),
            makeDie('green-1', { value: 5, allocatedTo: 'project-blue-2', locked: true }),
            makeDie('green-2', { value: 3 }),
            makeDie('green-3', { value: 4 }),
            makeDie('green-4', { value: 1 }),
          ],
        }),
        makePlayer('p2', 'blue', {
          dice: [
            makeDie('blue-0', { value: 2, allocatedTo: 'project-blue-2', locked: true }),
            makeDie('blue-1', { value: 3 }),
            makeDie('blue-2', { value: 4 }),
            makeDie('blue-3', { value: 1 }),
            makeDie('blue-4', { value: 5 }),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    const green = next.players.find(p => p.id === 'p1')
    expect(green.totalScore).toBe(8)
    expect(green.ownedCards).toHaveLength(0)
    expect(green.needsDraw).toBe(1)
    expect(next.teamScore).toBe(8)
    expect(green.dice.find(d => d.id === 'green-0').allocatedTo).toBeNull()
    expect(next.players.find(p => p.id === 'p2').dice[0].allocatedTo).toBeNull()
  })

  it('awards no points when slots are partially matched', () => {
    // Owner has [5, 4] but needs [5, 5]
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          ownedCards: [{ cardId: 'project-blue-2', drawnRound: 1 }],
          dice: [
            makeDie('green-0', { value: 5, allocatedTo: 'project-blue-2' }),
            makeDie('green-1', { value: 4, allocatedTo: 'project-blue-2' }),
            makeDie('green-2', { value: 3 }),
            makeDie('green-3', { value: 2 }),
            makeDie('green-4', { value: 1 }),
          ],
        }),
        makePlayer('p2', 'blue', {
          dice: [
            makeDie('blue-0', { value: 2, allocatedTo: 'project-blue-2' }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`blue-${i + 1}`, { value: i + 1 })),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    expect(next.players[0].totalScore).toBe(0)
    expect(next.players[0].ownedCards).toHaveLength(1)
  })
})

// ─── Score phase — urgent penalty ────────────────────────────────────────────

describe('ADVANCE_TO_SCORE — urgent penalty', () => {
  // project-blue-1: ownerDice [6], depDice [1,1], points 10, urgentPenalty 1

  it('applies the penalty in rounds after the draw round', () => {
    const state = makeState({
      round: 2,
      players: [
        makePlayer('p1', 'green', {
          ownedCards: [{ cardId: 'project-blue-1', drawnRound: 1 }],
          dice: Array.from({ length: 5 }, (_, i) => makeDie(`green-${i}`, { value: i + 1 })),
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    expect(next.players[0].totalScore).toBe(-1)
    expect(next.teamScore).toBe(-1)
  })

  it('does not apply the penalty in the draw round itself', () => {
    const state = makeState({
      round: 1,
      players: [
        makePlayer('p1', 'green', {
          ownedCards: [{ cardId: 'project-blue-1', drawnRound: 1 }],
          dice: Array.from({ length: 5 }, (_, i) => makeDie(`green-${i}`, { value: i + 1 })),
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    expect(next.players[0].totalScore).toBe(0)
  })

  it('accrues penalty for urgent cards sitting in the marketplace', () => {
    const state = makeState({
      round: 2,
      players: [makePlayer('p1', 'green')],
      marketplace: [{ cardId: 'project-blue-1', drawnRound: 1 }],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    expect(next.teamScore).toBe(-1)
  })
})

// ─── Score phase — side project ───────────────────────────────────────────────

describe('ADVANCE_TO_SCORE — side project', () => {
  it('scores 1 point per 6 rolled', () => {
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          dice: [
            makeDie('green-0', { value: 6, allocatedTo: 'side-1' }),
            makeDie('green-1', { value: 6, allocatedTo: 'side-1' }),
            makeDie('green-2', { value: 3, allocatedTo: 'side-1' }),
            makeDie('green-3', { value: 1 }),
            makeDie('green-4', { value: 2 }),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    expect(next.players[0].totalScore).toBe(2)
    expect(next.teamScore).toBe(2)
    expect(next.players[0].dice.every(d => d.allocatedTo === null)).toBe(true)
  })

  it('frees side project dice even when no 6s are rolled', () => {
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          dice: [
            makeDie('green-0', { value: 3, allocatedTo: 'side-1' }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`green-${i + 1}`, { value: 1 })),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    expect(next.players[0].totalScore).toBe(0)
    expect(next.players[0].dice[0].allocatedTo).toBeNull()
  })
})

// ─── Score phase — training card persistence ──────────────────────────────────

describe('ADVANCE_TO_SCORE — training card persistence', () => {
  it('locked training dice survive the score phase (partial progress preserved)', () => {
    // Regression: locked training dice were being freed in scoreRound
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          activeTrainingCards: [{ cardId: 'training-set-1' }],
          dice: [
            makeDie('green-0', { value: 6, allocatedTo: 'training-set-1', locked: true }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`green-${i + 1}`, { value: i + 1 })),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    const g = next.players[0]
    const lockedDie = g.dice.find(d => d.id === 'green-0')
    expect(lockedDie.locked).toBe(true)
    expect(lockedDie.allocatedTo).toBe('training-set-1')
    expect(g.completedTrainings).not.toContain('set')
    expect(g.activeTrainingCards).toHaveLength(1)
  })

  it('unmatched staging training dice are freed at score phase', () => {
    // A die with value 3 doesn't meet any Set training slot minimum
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          activeTrainingCards: [{ cardId: 'training-set-1' }],
          dice: [
            makeDie('green-0', { value: 3, allocatedTo: 'training-set-1' }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`green-${i + 1}`, { value: i + 1 })),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    const stagingDie = next.players[0].dice.find(d => d.id === 'green-0')
    expect(stagingDie.allocatedTo).toBeNull()
    expect(stagingDie.locked).toBe(false)
  })

  it('completes training and frees all dice when all slots are satisfied', () => {
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          activeTrainingCards: [{ cardId: 'training-set-1' }],
          dice: [
            makeDie('green-0', { value: 6, allocatedTo: 'training-set-1', locked: true }),
            makeDie('green-1', { value: 5, allocatedTo: 'training-set-1', locked: true }),
            makeDie('green-2', { value: 4, allocatedTo: 'training-set-1', locked: true }),
            makeDie('green-3', { value: 2 }),
            makeDie('green-4', { value: 1 }),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    const g = next.players[0]
    expect(g.completedTrainings).toContain('set')
    expect(g.activeTrainingCards).toHaveLength(0)
    expect(g.dice.every(d => d.allocatedTo === null)).toBe(true)
    expect(g.dice.every(d => !d.locked)).toBe(true)
  })

  it('locked training dice carry their value into the next round', () => {
    // Rework training: need 2 dice ≥4. Only 1 locked so far (partial).
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          activeTrainingCards: [{ cardId: 'training-rework-1' }],
          dice: [
            makeDie('green-0', { value: 5, allocatedTo: 'training-rework-1', locked: true }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`green-${i + 1}`, { value: i + 1 })),
          ],
        }),
      ],
    })
    const afterScore     = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    const afterNextRound = gameReducer(afterScore, { type: 'ADVANCE_TO_NEXT_ROUND' })
    const persistedDie   = afterNextRound.players[0].dice.find(d => d.id === 'green-0')
    expect(persistedDie.locked).toBe(true)
    expect(persistedDie.value).toBe(5)
    expect(persistedDie.allocatedTo).toBe('training-rework-1')
  })
})

// ─── ALLOCATE_ALL_TO_CARD ─────────────────────────────────────────────────────

describe('ALLOCATE_ALL_TO_CARD', () => {
  it('allocates all free (unlocked, unallocated) dice to the card', () => {
    const state = makeState({
      phase: 'plan',
      players: [
        makePlayer('p1', 'green', {
          ownedCards: [{ cardId: 'project-blue-1', drawnRound: 1 }],
          dice: [
            makeDie('green-0'),
            makeDie('green-1'),
            makeDie('green-2', { locked: true, allocatedTo: 'project-blue-1' }),
            makeDie('green-3', { allocatedTo: 'project-blue-1' }),
            makeDie('green-4'),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ALLOCATE_ALL_TO_CARD', playerId: 'p1', cardId: 'project-blue-1' })
    const p = next.players[0]
    expect(p.dice.find(d => d.id === 'green-0').allocatedTo).toBe('project-blue-1')
    expect(p.dice.find(d => d.id === 'green-1').allocatedTo).toBe('project-blue-1')
    expect(p.dice.find(d => d.id === 'green-2').allocatedTo).toBe('project-blue-1')  // locked, unchanged
    expect(p.dice.find(d => d.id === 'green-3').allocatedTo).toBe('project-blue-1')  // already allocated, unchanged
    expect(p.dice.find(d => d.id === 'green-4').allocatedTo).toBe('project-blue-1')
  })

  it('does not allocate when player is wrong dep colour and has no support training', () => {
    // project-blue-1 has depColour 'blue'; a green player without support cannot contribute as dep
    const ownerPlayer = makePlayer('p2', 'blue', {
      ownedCards: [{ cardId: 'project-blue-1', drawnRound: 1 }],
    })
    const contributor = makePlayer('p1', 'green')
    const state = makeState({ phase: 'plan', players: [contributor, ownerPlayer] })
    const next = gameReducer(state, { type: 'ALLOCATE_ALL_TO_CARD', playerId: 'p1', cardId: 'project-blue-1' })
    expect(next.players[0].dice.every(d => d.allocatedTo === null)).toBe(true)
  })

  it('does not allocate when side project already claimed by another player', () => {
    const state = makeState({
      phase: 'plan',
      players: [
        makePlayer('p1', 'green'),
        makePlayer('p2', 'blue', {
          dice: [
            makeDie('blue-0', { allocatedTo: 'side-1' }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`blue-${i + 1}`)),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ALLOCATE_ALL_TO_CARD', playerId: 'p1', cardId: 'side-1' })
    expect(next.players[0].dice.every(d => d.allocatedTo === null)).toBe(true)
  })

  it('is a no-op when player has no free dice', () => {
    const state = makeState({
      phase: 'plan',
      players: [
        makePlayer('p1', 'green', {
          ownedCards: [{ cardId: 'project-blue-1', drawnRound: 1 }],
          dice: Array.from({ length: 5 }, (_, i) =>
            makeDie(`green-${i}`, { locked: true, allocatedTo: 'project-blue-1' })
          ),
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ALLOCATE_ALL_TO_CARD', playerId: 'p1', cardId: 'project-blue-1' })
    expect(next).toStrictEqual(state)
  })
})

// ─── CLAIM_TRAINING_CARD ──────────────────────────────────────────────────────

describe('CLAIM_TRAINING_CARD', () => {
  it('adds the training card to the player lane', () => {
    const state = makeState({
      phase: 'plan',
      players: [makePlayer('p1', 'green')],
    })
    const next = gameReducer(state, { type: 'CLAIM_TRAINING_CARD', playerId: 'p1', cardId: 'training-rework-1' })
    expect(next.players[0].activeTrainingCards).toEqual([{ cardId: 'training-rework-1', claimedRound: 1 }])
  })

  it('is rejected when the player has already completed that training type', () => {
    const state = makeState({
      phase: 'plan',
      players: [makePlayer('p1', 'green', { completedTrainings: ['rework'] })],
    })
    const next = gameReducer(state, { type: 'CLAIM_TRAINING_CARD', playerId: 'p1', cardId: 'training-rework-1' })
    expect(next.players[0].activeTrainingCards).toHaveLength(0)
  })

  it('is rejected when the player already has the same type active in their lane', () => {
    const state = makeState({
      phase: 'plan',
      players: [makePlayer('p1', 'green', {
        activeTrainingCards: [{ cardId: 'training-rework-1' }],
      })],
    })
    // Trying to claim a different copy of the same type
    const next = gameReducer(state, { type: 'CLAIM_TRAINING_CARD', playerId: 'p1', cardId: 'training-rework-2' })
    expect(next.players[0].activeTrainingCards).toHaveLength(1)
  })

  it('is rejected when another player has already claimed that exact copy', () => {
    const state = makeState({
      phase: 'plan',
      players: [
        makePlayer('p1', 'green'),
        makePlayer('p2', 'blue', { activeTrainingCards: [{ cardId: 'training-rework-1' }] }),
      ],
    })
    const next = gameReducer(state, { type: 'CLAIM_TRAINING_CARD', playerId: 'p1', cardId: 'training-rework-1' })
    expect(next.players[0].activeTrainingCards).toHaveLength(0)
  })

  it('allows a different copy of the same type when the first is taken by another player', () => {
    const state = makeState({
      phase: 'plan',
      players: [
        makePlayer('p1', 'green'),
        makePlayer('p2', 'blue', { activeTrainingCards: [{ cardId: 'training-rework-1' }] }),
      ],
    })
    const next = gameReducer(state, { type: 'CLAIM_TRAINING_CARD', playerId: 'p1', cardId: 'training-rework-2' })
    expect(next.players[0].activeTrainingCards).toEqual([{ cardId: 'training-rework-2', claimedRound: 1 }])
  })
})

// ─── Work-phase matching (applyWorkMatches via SET_DIE_VALUE) ─────────────────

describe('applyWorkMatches — project dice locking', () => {
  // project-blue-2: ownerDice [5,5], depDice [2]
  // SET_DIE_VALUE is deterministic and triggers applyWorkMatches, making it ideal for these tests.

  it('locks a die when its set value exactly matches an open project slot', () => {
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          completedTrainings: ['set'],
          ownedCards: [{ cardId: 'project-blue-2', drawnRound: 1 }],
          dice: [
            makeDie('green-0', { allocatedTo: 'project-blue-2' }),  // value=null, will be set
            makeDie('green-1', { value: 5, allocatedTo: 'project-blue-2' }),
            makeDie('green-2'),
            makeDie('green-3'),
            makeDie('green-4'),
          ],
        }),
        makePlayer('p2', 'blue', {
          dice: [
            makeDie('blue-0', { value: 2, allocatedTo: 'project-blue-2' }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`blue-${i + 1}`)),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'SET_DIE_VALUE', playerId: 'p1', dieId: 'green-0', value: 5 })
    const die = next.players[0].dice.find(d => d.id === 'green-0')
    expect(die.value).toBe(5)
    expect(die.locked).toBe(true)
  })

  it('does not lock a die whose set value does not match any open slot', () => {
    // project-blue-2 needs owner value 5; setting to 4 should not lock
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          completedTrainings: ['set'],
          ownedCards: [{ cardId: 'project-blue-2', drawnRound: 1 }],
          dice: [
            makeDie('green-0', { allocatedTo: 'project-blue-2' }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`green-${i + 1}`)),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'SET_DIE_VALUE', playerId: 'p1', dieId: 'green-0', value: 4 })
    const die = next.players[0].dice.find(d => d.id === 'green-0')
    expect(die.value).toBe(4)
    expect(die.locked).toBe(false)
  })
})

describe('applyWorkMatches — training dice locking', () => {
  it('locks a die when its set value satisfies a training slot', () => {
    // Player has Set training (to use SET_DIE_VALUE) and Rework training card active in lane.
    // Sets a die to 5 (≥4 slot satisfied for rework training).
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          completedTrainings: ['set'],
          activeTrainingCards: [{ cardId: 'training-rework-1' }],
          dice: [
            makeDie('green-0', { allocatedTo: 'training-rework-1' }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`green-${i + 1}`)),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'SET_DIE_VALUE', playerId: 'p1', dieId: 'green-0', value: 5 })
    const die = next.players[0].dice.find(d => d.id === 'green-0')
    expect(die.value).toBe(5)
    expect(die.locked).toBe(true)
  })

  it('does not lock a training die whose value falls below all slot minimums', () => {
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          completedTrainings: ['set'],
          activeTrainingCards: [{ cardId: 'training-rework-1' }],
          dice: [
            makeDie('green-0', { allocatedTo: 'training-rework-1' }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`green-${i + 1}`)),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'SET_DIE_VALUE', playerId: 'p1', dieId: 'green-0', value: 3 })
    const die = next.players[0].dice.find(d => d.id === 'green-0')
    expect(die.value).toBe(3)
    expect(die.locked).toBe(false)
  })
})

// ─── USE_REWORK guards ────────────────────────────────────────────────────────

describe('USE_REWORK', () => {
  it('is rejected without rework training', () => {
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          dice: [
            makeDie('green-0', { value: 1 }),
            makeDie('green-1', { value: 2 }),
            ...Array.from({ length: 3 }, (_, i) => makeDie(`green-${i + 2}`)),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'USE_REWORK', playerId: 'p1', dieIds: ['green-0', 'green-1'] })
    expect(next.players[0].dice[0].value).toBe(1)  // unchanged
    expect(next.players[0].dice[1].value).toBe(2)  // unchanged
  })

  it('is rejected when rework has already been used this round', () => {
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          completedTrainings: ['rework'],
          reworkUsed: true,
          dice: [
            makeDie('green-0', { value: 1 }),
            makeDie('green-1', { value: 2 }),
            ...Array.from({ length: 3 }, (_, i) => makeDie(`green-${i + 2}`)),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'USE_REWORK', playerId: 'p1', dieIds: ['green-0', 'green-1'] })
    expect(next.players[0].dice[0].value).toBe(1)
    expect(next.players[0].reworkUsed).toBe(true)
  })

  it('is rejected when fewer than 2 die IDs are provided', () => {
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          completedTrainings: ['rework'],
          dice: [
            makeDie('green-0', { value: 1 }),
            ...Array.from({ length: 4 }, (_, i) => makeDie(`green-${i + 1}`)),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'USE_REWORK', playerId: 'p1', dieIds: ['green-0'] })
    expect(next.players[0].dice[0].value).toBe(1)
    expect(next.players[0].reworkUsed).toBe(false)
  })

  it('sets reworkUsed and re-rolls exactly 2 dice', () => {
    const state = makeState({
      players: [
        makePlayer('p1', 'green', {
          completedTrainings: ['rework'],
          dice: [
            makeDie('green-0', { value: 1 }),
            makeDie('green-1', { value: 2 }),
            makeDie('green-2', { value: 3 }),
            makeDie('green-3', { value: 4 }),
            makeDie('green-4', { value: 5 }),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'USE_REWORK', playerId: 'p1', dieIds: ['green-0', 'green-1'] })
    const p = next.players[0]
    expect(p.reworkUsed).toBe(true)
    // The two rerolled dice must have values 1-6 (non-null, in range)
    expect(p.dice[0].value).toBeGreaterThanOrEqual(1)
    expect(p.dice[0].value).toBeLessThanOrEqual(6)
    expect(p.dice[1].value).toBeGreaterThanOrEqual(1)
    expect(p.dice[1].value).toBeLessThanOrEqual(6)
    // The other three dice are untouched
    expect(p.dice[2].value).toBe(3)
    expect(p.dice[3].value).toBe(4)
    expect(p.dice[4].value).toBe(5)
  })
})

// ─── Round transition ─────────────────────────────────────────────────────────

describe('ADVANCE_TO_NEXT_ROUND', () => {
  it('increments the round number', () => {
    const state = makeState({ phase: 'score', round: 2, players: [makePlayer('p1', 'green')] })
    const next = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    expect(next.round).toBe(3)
  })

  it('locked dice keep their value; non-locked dice reset to null', () => {
    const state = makeState({
      phase: 'score',
      players: [
        makePlayer('p1', 'green', {
          dice: [
            makeDie('green-0', { value: 5, locked: true, allocatedTo: 'training-rework-1' }),
            makeDie('green-1', { value: 3 }),  // rolled but not locked — should reset
            makeDie('green-2'),
            makeDie('green-3'),
            makeDie('green-4'),
          ],
        }),
      ],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    const dice = next.players[0].dice
    expect(dice.find(d => d.id === 'green-0').value).toBe(5)   // locked: kept
    expect(dice.find(d => d.id === 'green-1').value).toBeNull() // not locked: reset
  })

  it('resets reworkUsed and setDieUsed for all players', () => {
    const state = makeState({
      phase: 'score',
      players: [makePlayer('p1', 'green', { reworkUsed: true, setDieUsed: true })],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    expect(next.players[0].reworkUsed).toBe(false)
    expect(next.players[0].setDieUsed).toBe(false)
  })

  it('sets gameOver when the final round is completed', () => {
    const state = makeState({ phase: 'score', round: 12, totalRounds: 12, players: [makePlayer('p1', 'green')] })
    const next = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    expect(next.gameOver).toBe(true)
  })
})

describe('PLAYER_DONE_PLANNING', () => {
  function makePlanState(playerCount = 2) {
    const players = Array.from({ length: playerCount }, (_, i) =>
      makePlayer(`p${i + 1}`, ['green', 'blue', 'red', 'yellow', 'purple', 'orange'][i])
    )
    return makeState({ phase: 'plan', players, planReadyPlayers: [] })
  }

  it('adds playerId to planReadyPlayers', () => {
    const state = makePlanState(2)
    const next = gameReducer(state, { type: 'PLAYER_DONE_PLANNING', playerId: 'p1' })
    expect(next.planReadyPlayers).toContain('p1')
    expect(next.phase).toBe('plan')
  })

  it('ignores duplicate calls from the same player', () => {
    const state = makePlanState(2)
    const once = gameReducer(state, { type: 'PLAYER_DONE_PLANNING', playerId: 'p1' })
    const twice = gameReducer(once, { type: 'PLAYER_DONE_PLANNING', playerId: 'p1' })
    expect(twice.planReadyPlayers.filter(id => id === 'p1')).toHaveLength(1)
  })

  it('advances to work phase when all players are ready', () => {
    const state = makePlanState(2)
    const after1 = gameReducer(state, { type: 'PLAYER_DONE_PLANNING', playerId: 'p1' })
    const after2 = gameReducer(after1, { type: 'PLAYER_DONE_PLANNING', playerId: 'p2' })
    expect(after2.phase).toBe('work')
    expect(after2.planReadyPlayers).toEqual([])
  })

  it('does nothing outside the plan phase', () => {
    const state = makeState({ phase: 'work', planReadyPlayers: [] })
    const next = gameReducer(state, { type: 'PLAYER_DONE_PLANNING', playerId: 'p1' })
    expect(next.planReadyPlayers).toEqual([])
  })
})

describe('planReadyPlayers resets on new round', () => {
  it('is empty after ADVANCE_TO_NEXT_ROUND', () => {
    const state = makeState({
      phase: 'score',
      round: 1,
      totalRounds: 12,
      planReadyPlayers: ['p1'],
      players: [makePlayer('p1', 'green')],
      roundScores: [{ round: 1, entries: [] }],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    expect(next.planReadyPlayers).toEqual([])
  })
})

describe('phase guards on advance actions', () => {
  it('ADVANCE_TO_NEXT_ROUND is a no-op outside score phase', () => {
    const state = makeState({ phase: 'plan', round: 3, planReadyPlayers: [] })
    const next = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    expect(next.round).toBe(3)
    expect(next.phase).toBe('plan')
  })

  it('ADVANCE_TO_SCORE is a no-op outside work phase', () => {
    const state = makeState({ phase: 'score', round: 1, planReadyPlayers: [] })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    expect(next.phase).toBe('score')
  })
})
