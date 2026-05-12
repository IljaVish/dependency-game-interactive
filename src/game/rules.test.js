import { describe, it, expect } from 'vitest'
import {
  isTrainingComplete,
  isProjectComplete,
  scoreSideProject,
  urgentPenaltyAccrued,
  canOwnProject,
  filterDeckForPlayerCount,
  assignLockedToSlots,
} from './rules.js'
import { TRAINING_DEFINITIONS } from '../data/cards.js'

const rework = TRAINING_DEFINITIONS.rework  // requiredMin: 4, requiredCount: 2
const support = TRAINING_DEFINITIONS.support // requiredMin: 4, requiredCount: 3
const set     = TRAINING_DEFINITIONS.set     // slots: [6, 5, 4]

// ─── isTrainingComplete ───────────────────────────────────────────────────────

describe('isTrainingComplete — rework (2 dice ≥4)', () => {
  it('complete with exactly 2 qualifying dice', () => {
    expect(isTrainingComplete(rework, [4, 4])).toBe(true)
  })
  it('complete when values exceed minimum', () => {
    expect(isTrainingComplete(rework, [5, 6])).toBe(true)
  })
  it('complete with extra non-qualifying dice', () => {
    expect(isTrainingComplete(rework, [4, 4, 1])).toBe(true)
  })
  it('incomplete with only 1 qualifying die', () => {
    expect(isTrainingComplete(rework, [4, 3])).toBe(false)
  })
  it('incomplete with no qualifying dice', () => {
    expect(isTrainingComplete(rework, [3, 3])).toBe(false)
  })
  it('incomplete with only 1 die total', () => {
    expect(isTrainingComplete(rework, [4])).toBe(false)
  })
})

describe('isTrainingComplete — support (3 dice ≥4)', () => {
  it('complete with exactly 3 qualifying dice', () => {
    expect(isTrainingComplete(support, [4, 4, 4])).toBe(true)
  })
  it('complete with values above minimum', () => {
    expect(isTrainingComplete(support, [4, 5, 6])).toBe(true)
  })
  it('incomplete with only 2 qualifying dice', () => {
    expect(isTrainingComplete(support, [4, 4, 3])).toBe(false)
  })
})

describe('isTrainingComplete — set (slots ≥6, ≥5, ≥4)', () => {
  it('complete with one die per slot', () => {
    expect(isTrainingComplete(set, [6, 5, 4])).toBe(true)
  })
  it('complete when a high value satisfies two slot minimums (greedy)', () => {
    // 6 fills ≥6, second 6 fills ≥5, 4 fills ≥4
    expect(isTrainingComplete(set, [6, 6, 4])).toBe(true)
  })
  it('incomplete with only 1 die, even a qualifying 6', () => {
    expect(isTrainingComplete(set, [6])).toBe(false)
  })
  it('incomplete when ≥6 slot cannot be filled', () => {
    expect(isTrainingComplete(set, [5, 5, 4])).toBe(false)
  })
  it('incomplete when ≥4 slot cannot be filled', () => {
    expect(isTrainingComplete(set, [6, 5, 3])).toBe(false)
  })
  it('incomplete with only 2 dice satisfying 2 slots', () => {
    expect(isTrainingComplete(set, [6, 5])).toBe(false)
  })
})

// ─── isProjectComplete ────────────────────────────────────────────────────────

describe('isProjectComplete', () => {
  const card = { ownerDice: [5, 5], depDice: [2] }

  it('complete when all slots match exactly', () => {
    expect(isProjectComplete(card, [5, 5], [2])).toBe(true)
  })
  it('complete with extra dice on both sides', () => {
    expect(isProjectComplete(card, [5, 5, 3], [2, 1])).toBe(true)
  })
  it('incomplete when an owner die has the wrong value', () => {
    expect(isProjectComplete(card, [5, 4], [2])).toBe(false)
  })
  it('incomplete when the dep die has the wrong value', () => {
    expect(isProjectComplete(card, [5, 5], [1])).toBe(false)
  })
  it('incomplete when there are not enough owner dice', () => {
    expect(isProjectComplete(card, [5], [2])).toBe(false)
  })
  it('incomplete when dep dice are missing', () => {
    expect(isProjectComplete(card, [5, 5], [])).toBe(false)
  })
})

// ─── scoreSideProject ─────────────────────────────────────────────────────────

describe('scoreSideProject', () => {
  it('scores 1 point per 6 rolled', () => {
    expect(scoreSideProject([6, 6, 6])).toBe(3)
  })
  it('scores 0 when no 6s are present', () => {
    expect(scoreSideProject([1, 2, 3, 4, 5])).toBe(0)
  })
  it('scores 0 for an empty array', () => {
    expect(scoreSideProject([])).toBe(0)
  })
  it('counts only 6s among mixed values', () => {
    expect(scoreSideProject([6, 1, 6, 3])).toBe(2)
  })
})

// ─── urgentPenaltyAccrued ─────────────────────────────────────────────────────

describe('urgentPenaltyAccrued', () => {
  const urgent1 = { urgentPenalty: 1 }
  const urgent2 = { urgentPenalty: 2 }
  const normal  = { urgentPenalty: 0 }

  it('accrues no penalty when delivered in the draw round', () => {
    expect(urgentPenaltyAccrued(urgent1, 1, 1, 1)).toBe(0)
  })
  it('accrues 1 round of penalty when delivered the round after drawing', () => {
    expect(urgentPenaltyAccrued(urgent1, 1, 2, 2)).toBe(1)
  })
  it('accrues 2 rounds of penalty when delivered 2 rounds after drawing', () => {
    expect(urgentPenaltyAccrued(urgent1, 1, 3, 3)).toBe(2)
  })
  it('scales by urgentPenalty multiplier', () => {
    expect(urgentPenaltyAccrued(urgent2, 1, 3, 3)).toBe(4)
  })
  it('accrues no penalty for non-urgent cards', () => {
    expect(urgentPenaltyAccrued(normal, 1, 5, 5)).toBe(0)
  })
  it('accrues running penalty using currentRound when card is still held', () => {
    expect(urgentPenaltyAccrued(urgent1, 1, null, 3)).toBe(2)
  })
  it('accrues no running penalty when still in the draw round', () => {
    expect(urgentPenaltyAccrued(urgent1, 3, null, 3)).toBe(0)
  })
})

// ─── canOwnProject ────────────────────────────────────────────────────────────

describe('canOwnProject', () => {
  it('cannot own a project whose depColour matches own colour', () => {
    expect(canOwnProject('green', { depColour: 'green' })).toBe(false)
  })
  it('can own a project with a different depColour', () => {
    expect(canOwnProject('green', { depColour: 'blue' })).toBe(true)
  })
})

// ─── filterDeckForPlayerCount ─────────────────────────────────────────────────

describe('filterDeckForPlayerCount', () => {
  const cards = [
    { id: 'a', depColour: 'green' },
    { id: 'b', depColour: 'red' },
    { id: 'c', depColour: 'blue' },
    { id: 'd', depColour: 'pink' },
  ]

  it('keeps only cards whose depColour is in the active colour set', () => {
    const result = filterDeckForPlayerCount(cards, ['green', 'blue', 'yellow', 'orange'])
    expect(result.map(c => c.id)).toEqual(['a', 'c'])
  })
  it('returns all cards when all dep colours are active', () => {
    expect(filterDeckForPlayerCount(cards, ['green', 'red', 'blue', 'pink'])).toHaveLength(4)
  })
  it('returns empty when no dep colours match', () => {
    expect(filterDeckForPlayerCount(cards, ['yellow', 'orange'])).toHaveLength(0)
  })
})

// ─── assignLockedToSlots ──────────────────────────────────────────────────────

describe('assignLockedToSlots — set training (slots ≥6, ≥5, ≥4)', () => {
  function die(value) { return { value } }

  it('bug scenario 1: locked [4,5] — 4 goes to ≥4, 5 to ≥5, ≥6 stays open', () => {
    // Roll 2,4,5,2 → only 4 and 5 lock. ≥6 slot must remain open (index 0).
    const r = assignLockedToSlots(set, [die(4), die(5)])
    expect(r[0]).toBeNull()         // ≥6 open
    expect(r[1].value).toBe(5)      // ≥5 filled
    expect(r[2].value).toBe(4)      // ≥4 filled
  })

  it('bug scenario 2: locked [4,6] — 6 goes to ≥6, 4 to ≥4, ≥5 stays open', () => {
    // Roll 4,2,1,2,6 → 4 and 6 lock. ≥5 slot must remain open (index 1).
    const r = assignLockedToSlots(set, [die(4), die(6)])
    expect(r[0].value).toBe(6)      // ≥6 filled
    expect(r[1]).toBeNull()         // ≥5 open
    expect(r[2].value).toBe(4)      // ≥4 filled
  })

  it('all three slots filled correctly', () => {
    const r = assignLockedToSlots(set, [die(4), die(5), die(6)])
    expect(r[0].value).toBe(6)
    expect(r[1].value).toBe(5)
    expect(r[2].value).toBe(4)
  })

  it('returns all nulls when no dice are locked', () => {
    const r = assignLockedToSlots(set, [])
    expect(r).toEqual([null, null, null])
  })
})

describe('assignLockedToSlots — rework training (2 dice ≥4)', () => {
  function die(value) { return { value } }

  it('fills slots positionally for requiredMin/requiredCount training', () => {
    const r = assignLockedToSlots(rework, [die(5)])
    expect(r[0].value).toBe(5)
    expect(r[1]).toBeNull()
  })
})
