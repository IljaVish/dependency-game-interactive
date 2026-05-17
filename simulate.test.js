import { describe, it, expect } from 'vitest'
import { runGame, strategies } from './simulate.js'

// Run N games for a strategy and return the final states.
function runN(s, n = 5) {
  return Array.from({ length: n }, () => runGame(s.fn, 12, s.args))
}

const SELFISH = strategies.find(s => s.name === 'Competitive / Selfish')
const TRAINING = strategies.filter(s => s.name.startsWith('Train'))
const COLLABORATIVE = strategies.filter(s => !s.name.startsWith('Competitive'))

// ── Bug guard: pendingCards[] API ────────────────────────────────────────────
// If the set phase uses the old `pendingCard` (singular), all dice fall through
// to side projects and no projects are ever owned or completed.  The symptom is
// that teamScore ≈ side-project-only score (~0-15 after urgent penalties).
// A working collaborative strategy scores ~50-70.

describe('set phase resolves pending cards', () => {
  for (const s of COLLABORATIVE) {
    it(`${s.name} — avg score > 30 (projects clearly completed)`, () => {
      const states = runN(s)
      const avg = states.reduce((sum, st) => sum + st.teamScore, 0) / states.length
      expect(avg).toBeGreaterThan(30)
    })
  }
})

// ── Bug guard: ownedCards[] API ──────────────────────────────────────────────
// If plan phase uses `p.ownedCard` (singular), the owner never allocates dice
// to their project — so scores stay near pure side-project level (~0-15).
// Same symptom as above; the two tests together triangulate which layer broke.

describe('plan phase allocates to owned projects', () => {
  it('non-selfish strategies score higher than selfish', () => {
    const selfishAvg = runN(SELFISH).reduce((s, st) => s + st.teamScore, 0) / 5
    for (const s of COLLABORATIVE) {
      const avg = runN(s).reduce((sum, st) => sum + st.teamScore, 0) / 5
      expect(avg).toBeGreaterThan(selfishAvg + 15)
    }
  })
})

// ── Bug guard: CLAIM_TRAINING_CARD required before ALLOCATE_DIE ──────────────
// If training strategies skip CLAIM_TRAINING_CARD, the engine silently rejects
// all dice allocations to training cards.  completedTrainings stays empty for
// every player in every game.

describe('training strategies complete training', () => {
  for (const s of TRAINING) {
    it(`${s.name} — at least one training completes across 5 games`, () => {
      const states = runN(s)
      const anyCompleted = states.some(st =>
        st.players.some(p => p.completedTrainings.length > 0)
      )
      expect(anyCompleted).toBe(true)
    })
  }
})

// ── Smoke: every strategy runs to completion ─────────────────────────────────

describe('all strategies run to completion', () => {
  for (const s of strategies) {
    it(s.name, () => {
      const state = runGame(s.fn, 12, s.args)
      expect(state.gameOver).toBe(true)
      expect(Number.isFinite(state.teamScore)).toBe(true)
    })
  }
})
