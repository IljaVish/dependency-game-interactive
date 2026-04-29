#!/usr/bin/env node
// Run from project root: node simulate.js
// 5 strategies × 30 games × 12 rounds — primary metric: teamScore

import { createInitialState, gameReducer, findCard } from './src/game/engine.js'
import { TRAINING_CARDS, TRAINING_DEFINITIONS, SIDE_PROJECT_CARDS } from './src/data/cards.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPlayer(state, id) { return state.players.find(p => p.id === id) }
function freeDice(player) { return player.dice.filter(d => !d.locked && d.allocatedTo === null) }
function cardPriority(card) { return card.urgentPenalty * 100 + card.points }

// How many more owner dice slots need to be allocated to this card
function ownerSlotsNeeded(state, card) {
  const owner = state.players.find(p => p.ownedCard?.cardId === card.id)
  if (!owner) return 0
  const already = owner.dice.filter(d => d.allocatedTo === card.id).length
  return Math.max(0, card.ownerDice.length - already)
}

// How many more dep dice slots need to be allocated to this card
function depSlotsNeeded(state, card) {
  const owner = state.players.find(p => p.ownedCard?.cardId === card.id)
  if (!owner) return card.depDice.length
  const already = state.players
    .filter(p => p.id !== owner.id)
    .flatMap(p => p.dice.filter(d => d.allocatedTo === card.id))
    .length
  return Math.max(0, card.depDice.length - already)
}

// Allocate up to `count` free dice from playerId to cardId
function allocate(state, playerId, cardId, count) {
  for (let i = 0; i < count; i++) {
    const p = getPlayer(state, playerId)
    const free = freeDice(p)
    if (free.length === 0) break
    state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId, dieId: free[0].id, cardId })
  }
  return state
}

// ── Set phase helpers ─────────────────────────────────────────────────────────

// Draw and keep — if card's depColour == player.colour (illegal), put to marketplace instead
function setPhase_keepOwn(state) {
  for (const { id } of state.players) {
    const p = getPlayer(state, id)
    if (!p.needsDraw || p.pendingCard !== null) continue
    state = gameReducer(state, { type: 'DRAW_CARD', playerId: id })
    const updated = getPlayer(state, id)
    if (!updated.pendingCard) continue
    const card = findCard(updated.pendingCard.cardId)
    if (card.type === 'project' && card.depColour === updated.colour) {
      state = gameReducer(state, { type: 'PUT_TO_MARKETPLACE', playerId: id })
    } else {
      state = gameReducer(state, { type: 'KEEP_CARD', playerId: id })
    }
  }
  return state
}

// Draw and put everything to marketplace; others take ownership in Plan phase
function setPhase_allMarketplace(state) {
  for (const { id } of state.players) {
    const p = getPlayer(state, id)
    if (!p.needsDraw || p.pendingCard !== null) continue
    state = gameReducer(state, { type: 'DRAW_CARD', playerId: id })
    if (getPlayer(state, id).pendingCard) {
      state = gameReducer(state, { type: 'PUT_TO_MARKETPLACE', playerId: id })
    }
  }
  return state
}

// Training players put to marketplace while still pursuing training; others keep
function setPhase_trainingFirst(state, trainingPlayerIds) {
  for (const { id } of state.players) {
    const p = getPlayer(state, id)
    if (!p.needsDraw || p.pendingCard !== null) continue
    state = gameReducer(state, { type: 'DRAW_CARD', playerId: id })
    if (!getPlayer(state, id).pendingCard) continue
    const trainee = getPlayer(state, id)
    const stillTraining = trainingPlayerIds.includes(id) && (
      (id === trainingPlayerIds[0] && !trainee.completedTrainings.includes('support')) ||
      (id === trainingPlayerIds[1] && !trainee.completedTrainings.includes('set'))
    )
    if (stillTraining) {
      state = gameReducer(state, { type: 'PUT_TO_MARKETPLACE', playerId: id })
    } else {
      const card = findCard(getPlayer(state, id).pendingCard.cardId)
      if (card.type === 'project' && card.depColour === getPlayer(state, id).colour) {
        state = gameReducer(state, { type: 'PUT_TO_MARKETPLACE', playerId: id })
      } else {
        state = gameReducer(state, { type: 'KEEP_CARD', playerId: id })
      }
    }
  }
  return state
}

// ── Plan phase helpers ────────────────────────────────────────────────────────

// Each owner allocates owner dice to their card
function planOwnerDice(state) {
  for (const { id } of state.players) {
    const p = getPlayer(state, id)
    if (!p.ownedCard) continue
    const card = findCard(p.ownedCard.cardId)
    const needed = ownerSlotsNeeded(state, card)
    if (needed > 0) state = allocate(state, id, card.id, needed)
  }
  return state
}

// Dep-colour players contribute dep dice to owned cards, sorted by comparator
function planDepDice(state, comparator) {
  const ownedCards = state.players
    .filter(p => p.ownedCard)
    .map(p => findCard(p.ownedCard.cardId))
    .sort(comparator)

  for (const card of ownedCards) {
    let needed = depSlotsNeeded(state, card)
    if (needed === 0) continue

    // Primary dep contributor: the dep-colour player
    const depPlayer = state.players.find(p => p.colour === card.depColour)
    if (depPlayer && freeDice(getPlayer(state, depPlayer.id)).length > 0) {
      state = allocate(state, depPlayer.id, card.id, needed)
      needed = depSlotsNeeded(state, card)
    }

    // Fallback: a support-trained player if dep player ran out
    if (needed > 0) {
      for (const p of state.players) {
        if (p.id === depPlayer?.id) continue
        if (!getPlayer(state, p.id).completedTrainings.includes('support')) continue
        if (freeDice(getPlayer(state, p.id)).length === 0) continue
        state = allocate(state, p.id, card.id, needed)
        if (depSlotsNeeded(state, card) === 0) break
        needed = depSlotsNeeded(state, card)
      }
    }
  }
  return state
}

// Training-first players allocate all their dice to the training card they're pursuing
function planTrainingDice(state, trainingPlayerIds) {
  const targetTypes = { [trainingPlayerIds[0]]: 'support', [trainingPlayerIds[1]]: 'set' }
  for (const id of trainingPlayerIds) {
    const p = getPlayer(state, id)
    const trainingType = targetTypes[id]
    if (!trainingType || p.completedTrainings.includes(trainingType)) continue

    // Find an unclaimed copy of this training type
    const tc = TRAINING_CARDS.find(c => {
      if (!c.id.includes(trainingType)) return false
      return !state.players.some(op => op.id !== id && op.dice.some(d => d.allocatedTo === c.id))
    })
    if (!tc) continue

    for (const die of freeDice(getPlayer(state, id))) {
      state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: id, dieId: die.id, cardId: tc.id })
    }
  }
  return state
}

// Each player takes the best card from marketplace that they can legally own
function planTakeFromMarketplace(state) {
  for (const { id } of state.players) {
    if (getPlayer(state, id).ownedCard) continue
    const sorted = [...state.marketplace]
      .map(e => ({ ...e, card: findCard(e.cardId) }))
      .sort((a, b) => cardPriority(b.card) - cardPriority(a.card))
    const playerColour = getPlayer(state, id).colour
    for (const entry of sorted) {
      if (entry.card.depColour === playerColour) continue
      if (!state.marketplace.some(e => e.cardId === entry.cardId)) continue
      state = gameReducer(state, { type: 'TAKE_FROM_MARKETPLACE', playerId: id, cardId: entry.cardId })
      break
    }
  }
  return state
}

// Dump leftover free dice onto unclaimed side project cards
function planSideProjects(state) {
  for (const { id } of state.players) {
    if (freeDice(getPlayer(state, id)).length === 0) continue
    for (const sc of SIDE_PROJECT_CARDS) {
      const claimed = state.players.some(op => op.id !== id && op.dice.some(d => d.allocatedTo === sc.id))
      if (claimed) continue
      for (const die of freeDice(getPlayer(state, id))) {
        state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: id, dieId: die.id, cardId: sc.id })
      }
      break
    }
  }
  return state
}

// ── Strategy functions (Set + Plan combined; Work/Score handled by runner) ────

// 1. Competitive/Selfish: keep own card, allocate only owner dice, extras to side projects
function strategy1(state) {
  state = setPhase_keepOwn(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planOwnerDice(state)
  // deliberate omission: no dep contributions
  state = planSideProjects(state)
  return state
}

// 2. Collaborative but Unfocused: contribute dep dice in arbitrary order
function strategy2(state) {
  state = setPhase_keepOwn(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planOwnerDice(state)
  state = planDepDice(state, () => 0)
  state = planSideProjects(state)
  return state
}

// 3. Collaborative and Smart: urgent-first, then highest points
function strategy3(state) {
  state = setPhase_keepOwn(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planOwnerDice(state)
  state = planDepDice(state, (a, b) => cardPriority(b) - cardPriority(a))
  state = planSideProjects(state)
  return state
}

// 4. Training-First then Smart: 2 players pursue Support + Set training first
function strategy4(state, trainingPlayerIds) {
  state = setPhase_trainingFirst(state, trainingPlayerIds)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planTrainingDice(state, trainingPlayerIds)
  state = planOwnerDice(state)
  state = planDepDice(state, (a, b) => cardPriority(b) - cardPriority(a))
  state = planSideProjects(state)
  return state
}

// 5. Smart Marketplace Optimization: all to marketplace, assign ownership as team
function strategy5(state) {
  state = setPhase_allMarketplace(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planTakeFromMarketplace(state)
  state = planOwnerDice(state)
  state = planDepDice(state, (a, b) => cardPriority(b) - cardPriority(a))
  state = planSideProjects(state)
  return state
}

// ── Strategy 6: Marketplace + Opportunistic Training ─────────────────────────
// Like S5 but: after meeting urgent dep obligations, players with ≥3 spare dice
// invest in Support or Set training (not Rework). Training is additive — players
// still own cards and contribute to projects. Training never crowds out urgent work.

// Dep dice for urgent cards only (called before training so obligations are met first)
function planDepDiceUrgent(state) {
  const urgent = state.players
    .filter(p => p.ownedCard)
    .map(p => findCard(p.ownedCard.cardId))
    .filter(c => c.urgentPenalty > 0)
    .sort((a, b) => cardPriority(b) - cardPriority(a))

  for (const card of urgent) {
    let needed = depSlotsNeeded(state, card)
    if (needed === 0) continue
    const dep = state.players.find(p => p.colour === card.depColour)
    if (dep && freeDice(getPlayer(state, dep.id)).length > 0) {
      state = allocate(state, dep.id, card.id, needed)
      needed = depSlotsNeeded(state, card)
    }
    if (needed > 0) {
      for (const p of state.players) {
        if (p.id === dep?.id) continue
        if (!getPlayer(state, p.id).completedTrainings.includes('support')) continue
        state = allocate(state, p.id, card.id, needed)
        needed = depSlotsNeeded(state, card)
        if (needed === 0) break
      }
    }
  }
  return state
}

// Use Set training: set one free die to the hardest remaining owner-slot value on your card.
// Must be called before planOwnerDice so the die is still unallocated.
function planUseSetTraining(state) {
  for (const { id } of state.players) {
    const p = getPlayer(state, id)
    if (!p.completedTrainings.includes('set') || p.setDieUsed || !p.ownedCard) continue
    const card = findCard(p.ownedCard.cardId)
    // Find remaining owner slots (not yet covered by locked dice)
    const lockedOwner = p.dice.filter(d => d.locked && d.allocatedTo === card.id)
    const remaining = [...card.ownerDice]
    for (const d of lockedOwner) { const i = remaining.indexOf(d.value); if (i !== -1) remaining.splice(i, 1) }
    if (remaining.length === 0) continue
    const targetValue = Math.max(...remaining)  // set to the hardest (highest) required value
    const die = freeDice(getPlayer(state, id))[0]
    if (!die) continue
    state = gameReducer(state, { type: 'SET_DIE_VALUE', playerId: id, dieId: die.id, value: targetValue })
  }
  return state
}

// Invest spare dice in Support or Set training (in that priority order).
// Only fires if player has ≥3 truly spare dice after ALL project obligations.
function planTrainingOpportunistic(state) {
  for (const { id } of state.players) {
    const p = getPlayer(state, id)
    if (freeDice(p).length < 3) continue

    const target = ['support', 'set'].find(t => !p.completedTrainings.includes(t))
    if (!target) continue

    const tc = TRAINING_CARDS.find(c =>
      c.id.includes(target) &&
      !state.players.some(op => op.id !== id && op.dice.some(d => d.allocatedTo === c.id))
    )
    if (!tc) continue

    for (const die of freeDice(getPlayer(state, id))) {
      state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: id, dieId: die.id, cardId: tc.id })
    }
  }
  return state
}

// Like planDepDice but support-trained players also proactively fill gaps.
function planDepDiceWithSupport(state, comparator) {
  const ownedCards = state.players
    .filter(p => p.ownedCard)
    .map(p => findCard(p.ownedCard.cardId))
    .sort(comparator)

  for (const card of ownedCards) {
    let needed = depSlotsNeeded(state, card)
    if (needed === 0) continue

    // Primary: natural dep-colour player
    const depPlayer = state.players.find(p => p.colour === card.depColour)
    if (depPlayer && freeDice(getPlayer(state, depPlayer.id)).length > 0) {
      state = allocate(state, depPlayer.id, card.id, needed)
      needed = depSlotsNeeded(state, card)
    }

    // Active Support contribution: any support-trained player fills remaining slots
    if (needed > 0) {
      const helpers = state.players
        .filter(p => p.id !== depPlayer?.id && getPlayer(state, p.id).completedTrainings.includes('support'))
        .sort((a, b) => freeDice(getPlayer(state, b.id)).length - freeDice(getPlayer(state, a.id)).length)
      for (const h of helpers) {
        if (freeDice(getPlayer(state, h.id)).length === 0) break
        state = allocate(state, h.id, card.id, needed)
        needed = depSlotsNeeded(state, card)
        if (needed === 0) break
      }
    }
  }
  return state
}

function strategy6(state) {
  state = setPhase_allMarketplace(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planTakeFromMarketplace(state)              // 1. Take best ownership from marketplace
  state = planUseSetTraining(state)                   // 2. Set training: guarantee hardest slot
  state = planOwnerDice(state)                        // 3. Own card's owner dice
  state = planDepDiceWithSupport(state, (a, b) => cardPriority(b) - cardPriority(a)) // 4. Dep + support
  state = planTrainingOpportunistic(state)            // 5. Spare dice → Support/Set training
  state = planSideProjects(state)                     // 6. Absolute leftovers → side projects
  return state
}

// ── Strategy 7: Dedicated Trainers + WIP ≤ 2 ─────────────────────────────────
//
// Roles (fixed for the game):
//   player-0 (green)  → trains Support with all 5 dice; after completion becomes
//                        universal dep contributor (never owns a project)
//   player-1 (blue)   → trains Set with all 5 dice; after completion takes a
//                        single-owner-die card and uses Set to guarantee that slot
//   player-2..5       → workers: at most 2 worker-owned projects in play at once
//                        (one owner + one dep contributor per project)
//
// Set phase: everyone draws → marketplace.
// Workers: eligible marketplace cards = those whose depColour is a worker colour
//   (trainers can't contribute dep dice while training; post-support the support
//   player acts as wildcard dep and eligibility opens to any colour).
// WIP gate: workers take a card only when current worker WIP < 2.

const S7_TRAINER_0 = 'player-0'
const S7_TRAINER_1 = 'player-1'
const S7_WORKERS   = ['player-2', 'player-3', 'player-4', 'player-5']

function countWorkerWIP(state) {
  return S7_WORKERS.filter(id => getPlayer(state, id).ownedCard).length
}

function strategy7(state) {
  state = setPhase_allMarketplace(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })

  const supportTrained = getPlayer(state, S7_TRAINER_0).completedTrainings.includes('support')
  const setTrained     = getPlayer(state, S7_TRAINER_1).completedTrainings.includes('set')
  const workerColours  = new Set(S7_WORKERS.map(id => getPlayer(state, id).colour))

  // ── Trainers: all 5 dice → their target training card ────────────────────────
  for (const [tid, target] of [[S7_TRAINER_0, 'support'], [S7_TRAINER_1, 'set']]) {
    if (getPlayer(state, tid).completedTrainings.includes(target)) continue
    const tc = TRAINING_CARDS.find(c =>
      c.id.includes(target) &&
      !state.players.some(op => op.id !== tid && op.dice.some(d => d.allocatedTo === c.id))
    )
    if (!tc) continue
    for (const die of freeDice(getPlayer(state, tid))) {
      state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: tid, dieId: die.id, cardId: tc.id })
    }
  }

  // ── Post-Set: blue takes the best single-owner-die card from marketplace ──────
  if (setTrained && !getPlayer(state, S7_TRAINER_1).ownedCard) {
    const blueColour = getPlayer(state, S7_TRAINER_1).colour
    const best = [...state.marketplace]
      .map(e => ({ ...e, card: findCard(e.cardId) }))
      .filter(e => e.card.depColour !== blueColour)
      .sort((a, b) => {
        // Strongly prefer 1 owner die (Set covers it fully), then urgency/value
        const aScore = (a.card.ownerDice.length === 1 ? 10000 : 0) + cardPriority(a.card)
        const bScore = (b.card.ownerDice.length === 1 ? 10000 : 0) + cardPriority(b.card)
        return bScore - aScore
      })[0]
    if (best) {
      state = gameReducer(state, { type: 'TAKE_FROM_MARKETPLACE', playerId: S7_TRAINER_1, cardId: best.cardId })
    }
  }

  // ── Workers: take from marketplace, WIP ≤ 2 ──────────────────────────────────
  const wip = countWorkerWIP(state)
  if (wip < 2) {
    // Before Support: only take cards whose dep colour is a worker (trainers unavailable)
    // After Support: any colour is fine (support player is the wildcard dep)
    const eligible = [...state.marketplace]
      .map(e => ({ ...e, card: findCard(e.cardId) }))
      .filter(e => supportTrained || workerColours.has(e.card.depColour))
      .sort((a, b) => cardPriority(b.card) - cardPriority(a.card))

    let taken = 0
    for (const entry of eligible) {
      if (taken >= 2 - wip) break
      if (!state.marketplace.some(e => e.cardId === entry.cardId)) continue
      let assigned = false
      for (const wid of S7_WORKERS) {
        const w = getPlayer(state, wid)
        if (w.ownedCard || entry.card.depColour === w.colour) continue
        state = gameReducer(state, { type: 'TAKE_FROM_MARKETPLACE', playerId: wid, cardId: entry.cardId })
        taken++
        assigned = true
        break
      }
      if (!assigned) continue
    }
  }

  // ── Set training: guarantee hardest owner slot (blue's card) ──────────────────
  state = planUseSetTraining(state)

  // ── Owner dice for all card owners ────────────────────────────────────────────
  state = planOwnerDice(state)

  // ── Dep dice: natural worker first, support player as wildcard ────────────────
  const allOwnedCards = state.players
    .filter(p => p.ownedCard)
    .map(p => findCard(p.ownedCard.cardId))
    .sort((a, b) => cardPriority(b) - cardPriority(a))

  for (const card of allOwnedCards) {
    let needed = depSlotsNeeded(state, card)
    if (needed === 0) continue

    // Natural dep contributor from the worker pool
    const depWid = S7_WORKERS.find(id => getPlayer(state, id).colour === card.depColour)
    if (depWid && freeDice(getPlayer(state, depWid)).length > 0) {
      state = allocate(state, depWid, card.id, needed)
      needed = depSlotsNeeded(state, card)
    }

    // Support player fills any remaining gap (acts as any colour)
    if (needed > 0 && supportTrained && freeDice(getPlayer(state, S7_TRAINER_0)).length > 0) {
      state = allocate(state, S7_TRAINER_0, card.id, needed)
    }
  }

  // ── Side projects with all remaining dice ─────────────────────────────────────
  state = planSideProjects(state)

  return state
}

// ── Game runner ───────────────────────────────────────────────────────────────

function runGame(strategyFn, totalRounds, extraArgs) {
  const playerDefs = ['green', 'blue', 'yellow', 'orange', 'red', 'pink'].map((colour, i) => ({
    id: `player-${i}`, name: colour, colour,
  }))
  let state = createInitialState({ playerDefs, totalRounds })

  while (true) {
    state = strategyFn(state, ...extraArgs)    // Set + Plan (ends in 'plan' phase)
    state = gameReducer(state, { type: 'ADVANCE_TO_WORK' })
    state = gameReducer(state, { type: 'ROLL_ALL_DICE' })
    state = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    state = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    if (state.gameOver) break
  }

  return state
}

// ── Main ──────────────────────────────────────────────────────────────────────

const GAMES = 50
const ROUNDS = 12
const TRAINING_PLAYERS = ['player-0', 'player-1']

const strategies = [
  { name: 'Competitive / Selfish',                   fn: strategy1, args: [] },
  { name: 'Collaborative but Unfocused',              fn: strategy2, args: [] },
  { name: 'Collaborative Smart (no training)',        fn: strategy3, args: [] },
  { name: 'Training-First then Smart',                fn: strategy4, args: [TRAINING_PLAYERS] },
  { name: 'Smart Marketplace Optimization',           fn: strategy5, args: [] },
  { name: 'Marketplace + Opportunistic Training',     fn: strategy6, args: [] },
  { name: 'Dedicated Trainers + WIP ≤ 2',            fn: strategy7, args: [] },
]

// ── Diagnostic: analyse one game for training activity ────────────────────────

function diagnoseGame(strategyFn, totalRounds, extraArgs) {
  const playerDefs = ['green', 'blue', 'yellow', 'orange', 'red', 'pink'].map((colour, i) => ({
    id: `player-${i}`, name: colour, colour,
  }))
  let state = createInitialState({ playerDefs, totalRounds })

  let trainingCompletions = 0
  let sideProjectPoints = 0
  let projectCompletions = 0
  let trainingAttemptDice = 0   // dice spent on training attempts

  while (true) {
    // Snapshot before plan to count training dice
    state = strategyFn(state, ...extraArgs)

    // Count dice going to training this round
    for (const p of state.players) {
      for (const d of p.dice) {
        if (d.allocatedTo && TRAINING_CARDS.some(tc => tc.id === d.allocatedTo)) {
          trainingAttemptDice++
        }
      }
    }

    state = gameReducer(state, { type: 'ADVANCE_TO_WORK' })
    state = gameReducer(state, { type: 'ROLL_ALL_DICE' })
    state = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })

    // Analyse round score entries
    const roundEntry = state.roundScores[state.roundScores.length - 1]
    for (const e of roundEntry.entries) {
      if (e.description === 'Side project') sideProjectPoints += e.points
      if (e.description.startsWith('Training:')) trainingCompletions++
      if (e.description.startsWith('Project delivered:')) projectCompletions++
    }

    state = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    if (state.gameOver) break
  }

  return { teamScore: state.teamScore, trainingCompletions, sideProjectPoints, projectCompletions, trainingAttemptDice }
}

console.log(`\nDependency Game Simulation`)
console.log(`${GAMES} games × ${ROUNDS} rounds × 6 players`)
console.log(`Primary metric: Team Score (the decisive collaborative number)\n`)

const results = strategies.map(s => {
  const scores = Array.from({ length: GAMES }, () => runGame(s.fn, ROUNDS, s.args).teamScore)
  const avg = scores.reduce((a, b) => a + b, 0) / GAMES
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const stddev = Math.sqrt(scores.reduce((sum, x) => sum + (x - avg) ** 2, 0) / GAMES)
  const median = [...scores].sort((a, b) => a - b)[Math.floor(GAMES / 2)]
  return { name: s.name, avg, median, min, max, stddev, scores }
})

// ── Summary table ─────────────────────────────────────────────────────────────

const W = 42
console.log('Strategy'.padEnd(W) + '  Avg'.padStart(7) + '  Med'.padStart(6) + '  Min'.padStart(6) + '  Max'.padStart(6) + '    σ'.padStart(6))
console.log('─'.repeat(W + 31))
for (const r of results) {
  console.log(
    r.name.padEnd(W) +
    r.avg.toFixed(1).padStart(7) +
    String(r.median).padStart(6) +
    String(r.min).padStart(6) +
    String(r.max).padStart(6) +
    r.stddev.toFixed(1).padStart(6)
  )
}

// ── Distributions ─────────────────────────────────────────────────────────────

// ── Training diagnostics ──────────────────────────────────────────────────────

console.log('\n── Training diagnostics (avg per game over 20 games) ────────────────────\n')
const diagStrategies = [
  { name: 'Training-First then Smart',            fn: strategy4, args: [TRAINING_PLAYERS] },
  { name: 'Marketplace + Opportunistic Training', fn: strategy6, args: [] },
  { name: 'Dedicated Trainers + WIP ≤ 2',        fn: strategy7, args: [] },
  { name: 'Smart Marketplace (no training)',      fn: strategy5, args: [] },
]
for (const s of diagStrategies) {
  const runs = Array.from({ length: 20 }, () => diagnoseGame(s.fn, ROUNDS, s.args))
  const avg = f => (runs.reduce((a, r) => a + r[f], 0) / runs.length).toFixed(1)
  console.log(`${s.name}:`)
  console.log(`  teamScore: ${avg('teamScore')}   projects completed: ${avg('projectCompletions')}   trainings completed: ${avg('trainingCompletions')}`)
  console.log(`  side-project pts: ${avg('sideProjectPoints')}   training attempt dice: ${avg('trainingAttemptDice')}`)
  console.log()
}

console.log('── Score distributions (each █ = 1 game) ────────────────────────────────\n')
for (const r of results) {
  console.log(`${r.name}  [avg ${r.avg.toFixed(1)}, range ${r.min}…${r.max}]`)
  const buckets = {}
  for (const s of r.scores) {
    const b = Math.floor(s / 5) * 5
    buckets[b] = (buckets[b] || 0) + 1
  }
  const keys = Object.keys(buckets).map(Number).sort((a, b) => a - b)
  for (const k of keys) {
    const label = `${String(k).padStart(4)}: `
    console.log(`  ${label}${'█'.repeat(buckets[k])} (${buckets[k]})`)
  }
  console.log()
}

// ── Sample final round scores for each strategy ───────────────────────────────

console.log('── Per-round team score trajectory (avg over all games) ─────────────────\n')
const SAMPLE_RUNS = 20
for (const s of strategies) {
  const runScores = Array.from({ length: SAMPLE_RUNS }, () => {
    const playerDefs = ['green', 'blue', 'yellow', 'orange', 'red', 'pink'].map((colour, i) => ({
      id: `player-${i}`, name: colour, colour,
    }))
    let state = createInitialState({ playerDefs, totalRounds: ROUNDS })
    const roundScores = []
    while (true) {
      state = s.fn(state, ...s.args)
      state = gameReducer(state, { type: 'ADVANCE_TO_WORK' })
      state = gameReducer(state, { type: 'ROLL_ALL_DICE' })
      state = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
      roundScores.push(state.teamScore)
      state = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
      if (state.gameOver) break
    }
    return roundScores
  })

  const avgByRound = Array.from({ length: ROUNDS }, (_, i) => {
    const vals = runScores.map(rs => rs[i] ?? null).filter(v => v !== null)
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  })

  console.log(`${s.name}:`)
  console.log(`  ${avgByRound.map((v, i) => `R${i + 1}:${v}`).join('  ')}`)
  console.log()
}
