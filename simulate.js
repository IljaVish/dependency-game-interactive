#!/usr/bin/env node
// Run from project root: node simulate.js
// 8 strategies × 50 games × 12 rounds — primary metric: teamScore

import { createInitialState, gameReducer, findCard } from './src/game/engine.js'
import { TRAINING_CARDS, TRAINING_DEFINITIONS, SIDE_PROJECT_CARDS } from './src/data/cards.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPlayer(state, id) { return state.players.find(p => p.id === id) }
function freeDice(player) { return player.dice.filter(d => !d.locked && d.allocatedTo === null) }
function cardPriority(card) { return card.urgentPenalty * 100 + card.points }
function percentile(sortedArr, p) {
  const idx = (p / 100) * (sortedArr.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return lo === hi ? sortedArr[lo] : Math.round(sortedArr[lo] + (idx - lo) * (sortedArr[hi] - sortedArr[lo]))
}

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

// Like planOwnerDice but commits ALL free dice to the owned card, not just the required number.
// More dice allocated = higher probability of rolling the required values in one round.
function planOwnerDiceFull(state) {
  for (const { id } of state.players) {
    const p = getPlayer(state, id)
    if (!p.ownedCard) continue
    const cardId = p.ownedCard.cardId
    for (const die of freeDice(p)) {
      state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: id, dieId: die.id, cardId })
    }
  }
  return state
}

// Contribute dep dice prioritised by cards closest to completion (fewest remaining slots first).
// Cards nearly done get served first, maximising the chance something actually crosses the line.
function planDepDiceByCompletion(state) {
  const ownedCards = state.players
    .filter(p => p.ownedCard)
    .map(p => findCard(p.ownedCard.cardId))

  const remaining = c => ownerSlotsNeeded(state, c) + depSlotsNeeded(state, c)
  const sorted = [...ownedCards].sort((a, b) => {
    const diff = remaining(a) - remaining(b)
    return diff !== 0 ? diff : cardPriority(b) - cardPriority(a)
  })

  for (const card of sorted) {
    let needed = depSlotsNeeded(state, card)
    if (needed === 0) continue

    const depPlayer = state.players.find(p => p.colour === card.depColour)
    if (depPlayer && freeDice(getPlayer(state, depPlayer.id)).length > 0) {
      state = allocate(state, depPlayer.id, card.id, needed)
      needed = depSlotsNeeded(state, card)
    }

    if (needed > 0) {
      for (const p of state.players) {
        if (p.id === depPlayer?.id) continue
        if (!getPlayer(state, p.id).completedTrainings.includes('support')) continue
        if (freeDice(getPlayer(state, p.id)).length === 0) continue
        state = allocate(state, p.id, card.id, needed)
        needed = depSlotsNeeded(state, card)
        if (needed === 0) break
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

// Like planTakeFromMarketplaceWIPLimited but counts only projects with unmet dep
// slots toward WIP. Projects with all dep slots locked (nearly done) don't block
// a new take. avoidDepColours: skip cards whose dep colour is in this set.
function planTakeFromMarketplaceWIPSmart(state, maxWIP, avoidDepColours = new Set()) {
  for (const { id } of state.players) {
    if (getPlayer(state, id).ownedCard) continue
    const effectiveWIP = state.players.filter(p => {
      if (!p.ownedCard) return false
      return depSlotsNeeded(state, findCard(p.ownedCard.cardId)) > 0
    }).length
    if (effectiveWIP >= maxWIP) continue
    const sorted = [...state.marketplace]
      .map(e => ({ ...e, card: findCard(e.cardId) }))
      .sort((a, b) => cardPriority(b.card) - cardPriority(a.card))
    const playerColour = getPlayer(state, id).colour
    for (const entry of sorted) {
      if (entry.card.depColour === playerColour) continue
      if (avoidDepColours.has(entry.card.depColour)) continue
      if (!state.marketplace.some(e => e.cardId === entry.cardId)) continue
      state = gameReducer(state, { type: 'TAKE_FROM_MARKETPLACE', playerId: id, cardId: entry.cardId })
      break
    }
  }
  return state
}

// Like planTakeFromMarketplace but stops once total owned projects reaches maxWIP
function planTakeFromMarketplaceWIPLimited(state, maxWIP) {
  for (const { id } of state.players) {
    if (state.players.filter(p => p.ownedCard).length >= maxWIP) break
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

// Dep contributors commit ALL their free dice to their single highest-priority dep project.
// Never splits a player's dice across multiple dep projects in the same round.
// Priority: fewest total remaining slots (closest to done), then urgency/points.
function planDepDiceFocused(state, urgentFirst = false) {
  const pendingCards = state.players
    .filter(p => p.ownedCard)
    .map(p => findCard(p.ownedCard.cardId))
    .filter(c => depSlotsNeeded(state, c) > 0)

  const totalRemaining = c => ownerSlotsNeeded(state, c) + depSlotsNeeded(state, c)
  const sorted = [...pendingCards].sort((a, b) => {
    if (urgentFirst && a.urgentPenalty !== b.urgentPenalty) return b.urgentPenalty - a.urgentPenalty
    const diff = totalRemaining(a) - totalRemaining(b)
    return diff !== 0 ? diff : cardPriority(b) - cardPriority(a)
  })

  const committed = new Set()
  for (const card of sorted) {
    const depPlayer = state.players.find(p => p.colour === card.depColour)
    if (!depPlayer || committed.has(depPlayer.id)) continue
    const free = freeDice(getPlayer(state, depPlayer.id))
    if (free.length === 0) { committed.add(depPlayer.id); continue }
    for (const die of free) {
      state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: depPlayer.id, dieId: die.id, cardId: card.id })
    }
    committed.add(depPlayer.id)
  }
  return state
}

// Like planDepDiceFocused but Support-trained players act as dep wildcards.
// Natural dep-colour player is tried first. If they're already committed or have
// no free dice, the first available Support-trained player steps in instead.
// Each player commits ALL their free dice to one card — no splitting.
function planDepDiceFocusedWithSupport(state, urgentFirst = false) {
  const pendingCards = state.players
    .filter(p => p.ownedCard)
    .map(p => findCard(p.ownedCard.cardId))
    .filter(c => depSlotsNeeded(state, c) > 0)

  const totalRemaining = c => ownerSlotsNeeded(state, c) + depSlotsNeeded(state, c)
  const sorted = [...pendingCards].sort((a, b) => {
    if (urgentFirst && a.urgentPenalty !== b.urgentPenalty) return b.urgentPenalty - a.urgentPenalty
    const diff = totalRemaining(a) - totalRemaining(b)
    return diff !== 0 ? diff : cardPriority(b) - cardPriority(a)
  })

  const committed = new Set()
  for (const card of sorted) {
    const depPlayer = state.players.find(p => p.colour === card.depColour)

    // Natural dep-colour player first
    if (depPlayer && !committed.has(depPlayer.id)) {
      const free = freeDice(getPlayer(state, depPlayer.id))
      committed.add(depPlayer.id)
      if (free.length > 0) {
        for (const die of free)
          state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: depPlayer.id, dieId: die.id, cardId: card.id })
        continue
      }
      // Dep player has no free dice — fall through to support
    }

    // Support-trained wildcard
    for (const p of state.players) {
      if (committed.has(p.id)) continue
      if (!getPlayer(state, p.id).completedTrainings.includes('support')) continue
      const free = freeDice(getPlayer(state, p.id))
      if (free.length === 0) continue
      for (const die of free)
        state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: p.id, dieId: die.id, cardId: card.id })
      committed.add(p.id)
      break
    }
  }
  return state
}

// Side projects only for players who have no opportunity to contribute natural dep dice.
// Players whose colour is still needed as dep on any owned card skip side projects.
function planSideProjectsIfNoDepNeeds(state) {
  for (const { id } of state.players) {
    const p = getPlayer(state, id)
    if (freeDice(p).length === 0) continue

    const stillNeededAsDep = state.players.some(op => {
      if (!op.ownedCard) return false
      const card = findCard(op.ownedCard.cardId)
      return card.depColour === p.colour && depSlotsNeeded(state, card) > 0
    })
    if (stillNeededAsDep) continue

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

// ── Strategy 6 helpers ────────────────────────────────────────────────────────

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

// After rolling, rework-trained players reroll their 2 worst (unmatched) dice.
// Only fires if the player has an owned card and ≥2 dice that don't satisfy any
// remaining owner slot — avoids rerolling dice that are already doing useful work.
function applyReworkAbility(state) {
  for (const { id } of state.players) {
    const p = state.players.find(pl => pl.id === id)
    if (!p.completedTrainings.includes('rework') || p.reworkUsed) continue
    if (!p.ownedCard) continue

    const card = findCard(p.ownedCard.cardId)
    const lockedOwner = p.dice.filter(d => d.locked && d.allocatedTo === card.id)
    const remaining = [...card.ownerDice]
    for (const d of lockedOwner) {
      const i = remaining.indexOf(d.value)
      if (i !== -1) remaining.splice(i, 1)
    }

    const rolled = p.dice.filter(d => !d.locked && d.value !== null && d.allocatedTo === card.id)
    const pool = [...rolled]
    const matched = new Set()
    for (const slot of remaining) {
      const i = pool.findIndex(d => d.value === slot)
      if (i !== -1) { matched.add(pool[i].id); pool.splice(i, 1) }
    }
    const wasted = rolled.filter(d => !matched.has(d.id)).sort((a, b) => a.value - b.value)
    if (wasted.length < 2) continue

    state = gameReducer(state, { type: 'USE_REWORK', playerId: id, dieIds: [wasted[0].id, wasted[1].id] })
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

// 2. Collaborative and Smart: urgent-first, dep obligations served before own card,
//    all remaining dice committed to owned project, side projects only if truly idle.
function strategy2(state) {
  state = setPhase_keepOwn(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planDepDice(state, (a, b) => cardPriority(b) - cardPriority(a))
  state = planOwnerDiceFull(state)
  state = planSideProjectsIfNoDepNeeds(state)
  return state
}

// 3. Training-First then Smart: 2 players pursue Support + Set training first
function strategy3(state, trainingPlayerIds) {
  state = setPhase_trainingFirst(state, trainingPlayerIds)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planTrainingDice(state, trainingPlayerIds)
  state = planOwnerDice(state)
  state = planDepDice(state, (a, b) => cardPriority(b) - cardPriority(a))
  state = planSideProjects(state)
  return state
}

// Keep Own Card: players keep their drawn card (or put it to marketplace if dep colour
// matches own colour). Players without a card after Set take one from the marketplace.
// Full dep collaboration — isolates the cost of reduced visibility vs marketplace-first.
function strategyKeepOwn(state) {
  state = setPhase_keepOwn(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planTakeFromMarketplace(state)          // players who drew an illegal card grab one
  state = planDepDiceFocused(state)              // completion-first dep focus
  state = planOwnerDiceFull(state)
  state = planSideProjectsIfNoDepNeeds(state)
  return state
}

// Urgent First: all to marketplace, dep player commits ALL dice to one project,
// prioritising urgent cards first (penalty avoidance). WIP capped at `wip`.
function strategy4(state, wip = 3) {
  state = setPhase_allMarketplace(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planTakeFromMarketplaceWIPLimited(state, wip)
  state = planDepDiceFocused(state, true)
  state = planOwnerDiceFull(state)
  state = planSideProjectsIfNoDepNeeds(state)
  return state
}

// 5. Marketplace + Opportunistic Training
function strategy5(state) {
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

// ── Strategy 6: Dedicated Trainers – Dynamic ─────────────────────────────────
//
// Round 1: all dump to marketplace. From there, find 2 projects whose dep colours
// are different, letting exactly 2 players take ownership, 2 players contribute
// their natural dep colour, and 2 players focus entirely on Support + Set training.
// Trainer assignment is determined by which players are "left over" after filling
// the best-scoring 2-project combination — no fixed colours.
//
// Rounds 2+: trainers continue training until done (all 5 dice to training card);
// workers play S4-smart with Support as dep wildcard once available.
// Once a trainer completes, they join as a regular smart-marketplace player.

function makeStrategy6() {
  let trainerIds = null
  let trainerTargets = null  // { playerId → 'support' | 'set' }

  return function(state) {
    if (state.round === 1) {
      trainerIds = null
      trainerTargets = null

      state = setPhase_allMarketplace(state)
      state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })

      // Find best 2-project pair leaving 2 players free for training.
      // Need: c1.depColour ≠ c2.depColour so dep roles go to 2 different players.
      const marketCards = state.marketplace
        .map(e => findCard(e.cardId))
        .filter(c => c.type === 'project')

      let bestPlan = null
      let bestScore = -Infinity

      for (let i = 0; i < marketCards.length; i++) {
        for (let j = i + 1; j < marketCards.length; j++) {
          const c1 = marketCards[i], c2 = marketCards[j]
          if (c1.depColour === c2.depColour) continue

          const dep1 = state.players.find(p => p.colour === c1.depColour)
          const dep2 = state.players.find(p => p.colour === c2.depColour)
          if (!dep1 || !dep2 || dep1.id === dep2.id) continue

          const rest = state.players.filter(p => p.id !== dep1.id && p.id !== dep2.id)
          const owners1 = rest.filter(p => p.colour !== c1.depColour)
          const owners2 = rest.filter(p => p.colour !== c2.depColour)

          for (const o1 of owners1) {
            for (const o2 of owners2.filter(p => p.id !== o1.id)) {
              const trainers = rest.filter(p => p.id !== o1.id && p.id !== o2.id)
              if (trainers.length !== 2) continue
              const score = cardPriority(c1) + cardPriority(c2)
              if (score > bestScore) {
                bestScore = score
                bestPlan = { c1, c2, owner1: o1, owner2: o2, dep1, dep2, trainers }
              }
            }
          }
        }
      }

      if (bestPlan) {
        state = gameReducer(state, { type: 'TAKE_FROM_MARKETPLACE', playerId: bestPlan.owner1.id, cardId: bestPlan.c1.id })
        state = gameReducer(state, { type: 'TAKE_FROM_MARKETPLACE', playerId: bestPlan.owner2.id, cardId: bestPlan.c2.id })
        trainerIds = bestPlan.trainers.map(t => t.id)
        trainerTargets = Object.fromEntries(
          bestPlan.trainers.map((t, i) => [t.id, i === 0 ? 'support' : 'set'])
        )
      } else {
        // No valid pair found — fall back to standard marketplace assignment
        state = planTakeFromMarketplace(state)
        trainerIds = []
        trainerTargets = {}
      }

      // Trainers: all dice → their assigned training card
      for (const id of (trainerIds || [])) {
        const target = trainerTargets[id]
        const tc = TRAINING_CARDS.find(c =>
          c.id.includes(target) &&
          !state.players.some(op => op.id !== id && op.dice.some(d => d.allocatedTo === c.id))
        )
        if (!tc) continue
        for (const die of freeDice(getPlayer(state, id))) {
          state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: id, dieId: die.id, cardId: tc.id })
        }
      }

      state = planOwnerDice(state)
      state = planDepDice(state, (a, b) => cardPriority(b) - cardPriority(a))
      state = planSideProjects(state)

    } else {
      // Rounds 2+
      state = setPhase_allMarketplace(state)
      state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })

      const activeTrainers = (trainerIds || []).filter(id => {
        const target = trainerTargets?.[id]
        return target && !getPlayer(state, id).completedTrainings.includes(target)
      })

      // Non-trainers (and graduated trainers) take from marketplace
      for (const { id } of state.players) {
        if (activeTrainers.includes(id)) continue
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

      // Active trainers: all dice → their training card
      for (const id of activeTrainers) {
        const target = trainerTargets[id]
        const tc = TRAINING_CARDS.find(c =>
          c.id.includes(target) &&
          !state.players.some(op => op.id !== id && op.dice.some(d => d.allocatedTo === c.id))
        )
        if (!tc) continue
        for (const die of freeDice(getPlayer(state, id))) {
          state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: id, dieId: die.id, cardId: tc.id })
        }
      }

      state = planUseSetTraining(state)
      state = planOwnerDice(state)
      state = planDepDiceWithSupport(state, (a, b) => cardPriority(b) - cardPriority(a))
      state = planSideProjects(state)
    }

    return state
  }
}

// ── Strategy 7: Throughput Focus ─────────────────────────────────────────────
//
// All to marketplace. WIP capped at 4 to avoid spreading dep dice too thin.
// Dep contributions are prioritised towards cards with fewest remaining slots —
// "nearly done" cards are served first to maximise completions per round.
// Side projects are skipped for any player whose colour is still needed as a
// natural dep contributor on an active project.

const THROUGHPUT_WIP = 4

function strategy7(state) {
  state = setPhase_allMarketplace(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planTakeFromMarketplaceWIPLimited(state, THROUGHPUT_WIP)
  state = planDepDiceByCompletion(state)
  state = planOwnerDiceFull(state)
  state = planSideProjectsIfNoDepNeeds(state)
  return state
}

// ── Strategy 8: Realistic – Mixed Awareness ───────────────────────────────────
//
// Models a typical first-time group: half the players keep their card privately
// (they haven't figured out that making work visible helps), the other half put
// theirs on the marketplace. The marketplace players then contribute dep dice if
// their colour matches an owned card, and invest in training otherwise.
// After REALISTIC_SWITCH_ROUND, the whole group has clicked and switches to the
// fully collaborative S4 (Smart Marketplace) approach.

const REALISTIC_KEEPER_IDS = new Set(['player-0', 'player-1', 'player-2'])
const REALISTIC_SWITCH_ROUND = 4

function strategy8(state) {
  if (state.round >= REALISTIC_SWITCH_ROUND) {
    return strategy4(state)
  }

  // Set phase: keepers keep, others put to marketplace (illegal cards always to marketplace)
  for (const { id } of state.players) {
    const p = getPlayer(state, id)
    if (!p.needsDraw || p.pendingCard !== null) continue
    state = gameReducer(state, { type: 'DRAW_CARD', playerId: id })
    if (!getPlayer(state, id).pendingCard) continue
    const card = findCard(getPlayer(state, id).pendingCard.cardId)
    const illegalOwn = card.type === 'project' && card.depColour === getPlayer(state, id).colour
    if (REALISTIC_KEEPER_IDS.has(id) && !illegalOwn) {
      state = gameReducer(state, { type: 'KEEP_CARD', playerId: id })
    } else {
      state = gameReducer(state, { type: 'PUT_TO_MARKETPLACE', playerId: id })
    }
  }

  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planOwnerDice(state)
  // Natural dep contributions to keeper cards (also works if a marketplace player
  // happens to complete their project and takes a keeper slot via the marketplace)
  state = planDepDice(state, (a, b) => cardPriority(b) - cardPriority(a))

  // Marketplace players with remaining free dice pursue training
  for (const { id } of state.players) {
    if (REALISTIC_KEEPER_IDS.has(id)) continue
    const p = getPlayer(state, id)
    if (freeDice(p).length === 0) continue
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

  state = planSideProjects(state)
  return state
}

// ── Strategy 9: Maximum Project Focus ────────────────────────────────────────
//
// The fundamental insight this strategy tests: allocating MORE dice than required
// to a project dramatically increases completion probability, because matching is
// greedy — extra dice simply get freed if they don't match a slot. With 5 dice
// chasing a required "6", P(hit) ≈ 60% vs ~17% with 1 die.
//
// Rules:
//   - All to marketplace; WIP ≤ 3 so dep colours stay concentrated.
//   - Dep obligations first: dep player commits ALL free dice to their ONE
//     highest-priority project (fewest remaining slots). No splitting.
//   - Then owners commit ALL remaining free dice to their card.
//   - No side projects — unallocated dice just don't contribute this round.

function strategy9(state, wip = 3) {
  state = setPhase_allMarketplace(state)
  state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })
  state = planTakeFromMarketplaceWIPLimited(state, wip)
  state = planDepDiceFocused(state)          // dep first: ALL dice to one project
  state = planOwnerDiceFull(state)           // owners: ALL remaining dice to owned card
  state = planSideProjectsIfNoDepNeeds(state) // idle players (no dep/owner role) → side projects
  return state
}

// ── Training strategy factory ─────────────────────────────────────────────────
//
// Round 1: all cards to marketplace. Exhaustive search finds the best 2-project
// pair whose dep colours are both covered by non-trainer players. The trainers are
// whoever is "left over" after filling the best owner + dep assignments. Ownership
// is assigned directly; trainers commit all dice to their training card.
//
// Rounds 2+: active trainers (not yet finished) keep training. Non-trainers use
// WIP≤3 smart marketplace taking, skipping cards whose dep colour belongs to a
// player still in training (their dice are unavailable for dep work).
//
// Graduation: the moment a trainer's target training appears in completedTrainings
// they stop training and join the project team as a regular worker next round.
//
// Post-training abilities applied every round once active:
//   Set     – planUseSetTraining sets hardest remaining owner-slot die before rolling
//   Support – planDepDiceFocusedWithSupport uses Support players as dep wildcards

function makeTrainingStrategy(trainingTypes) {
  const numTrainers = trainingTypes.length
  let trainerIds    = null
  let trainerTargets = null  // { playerId → 'set' | 'support' }

  return function(state) {
    if (state.round === 1) { trainerIds = null; trainerTargets = null }

    state = setPhase_allMarketplace(state)
    state = gameReducer(state, { type: 'ADVANCE_TO_PLAN' })

    // ── Round 1: assign trainers + initial project ownership ─────────────────
    if (state.round === 1) {
      const marketCards = state.marketplace
        .map(e => findCard(e.cardId))
        .filter(c => c.type === 'project')

      let bestPlan  = null
      let bestScore = -Infinity

      const tryCombo = (trainerCandidates) => {
        const trainerColours = new Set(trainerCandidates.map(p => p.colour))
        const workers = state.players.filter(p => !trainerCandidates.some(t => t.id === p.id))
        for (let i = 0; i < marketCards.length; i++) {
          const c1 = marketCards[i]
          if (trainerColours.has(c1.depColour)) continue
          const dep1 = workers.find(p => p.colour === c1.depColour)
          if (!dep1) continue
          for (let j = i + 1; j < marketCards.length; j++) {
            const c2 = marketCards[j]
            if (trainerColours.has(c2.depColour)) continue
            if (c2.depColour === c1.depColour) continue
            const dep2 = workers.find(p => p.colour === c2.depColour)
            if (!dep2) continue
            const rest = workers.filter(p => p.id !== dep1.id && p.id !== dep2.id)
            for (const o1 of rest) {
              for (const o2 of rest.filter(p => p.id !== o1.id)) {
                const score = cardPriority(c1) + cardPriority(c2)
                if (score > bestScore) {
                  bestScore = score
                  bestPlan = { c1, c2, o1Id: o1.id, o2Id: o2.id, trainerCandidates }
                }
              }
            }
          }
        }
      }

      if (numTrainers === 1) {
        for (const p of state.players) tryCombo([p])
      } else {
        for (let i = 0; i < state.players.length; i++)
          for (let j = i + 1; j < state.players.length; j++)
            tryCombo([state.players[i], state.players[j]])
      }

      if (bestPlan) {
        state = gameReducer(state, { type: 'TAKE_FROM_MARKETPLACE', playerId: bestPlan.o1Id, cardId: bestPlan.c1.id })
        state = gameReducer(state, { type: 'TAKE_FROM_MARKETPLACE', playerId: bestPlan.o2Id, cardId: bestPlan.c2.id })
        trainerIds     = bestPlan.trainerCandidates.map(t => t.id)
        trainerTargets = Object.fromEntries(bestPlan.trainerCandidates.map((t, i) => [t.id, trainingTypes[i]]))
      } else {
        // Fallback: any marketplace taking, first N players train
        state = planTakeFromMarketplaceWIPLimited(state, 3)
        trainerIds     = state.players.slice(0, numTrainers).map(p => p.id)
        trainerTargets = Object.fromEntries(trainerIds.map((id, i) => [id, trainingTypes[i]]))
      }

      // 1P training: the 5th worker can still pick up a 3rd project
      if (numTrainers === 1) {
        state = planTakeFromMarketplaceWIPLimited(state, 3)
      }

    // ── Rounds 2+ ─────────────────────────────────────────────────────────────
    } else {
      state = planTakeFromMarketplaceWIPLimited(state, 3)
    }

    // ── Commit active trainers' dice to their training card ───────────────────
    const activeTrainers = (trainerIds || []).filter(id => {
      const t = trainerTargets?.[id]
      return t && !getPlayer(state, id).completedTrainings.includes(t)
    })
    for (const id of activeTrainers) {
      const target = trainerTargets[id]
      const tc = TRAINING_CARDS.find(c =>
        c.id.includes(target) &&
        !state.players.some(op => op.id !== id && op.dice.some(d => d.allocatedTo === c.id))
      )
      if (!tc) continue
      for (const die of freeDice(getPlayer(state, id)))
        state = gameReducer(state, { type: 'ALLOCATE_DIE', playerId: id, dieId: die.id, cardId: tc.id })
    }

    // ── Project dice ──────────────────────────────────────────────────────────
    const anySupport = state.players.some(p => p.completedTrainings.includes('support'))
    state = anySupport
      ? planDepDiceFocusedWithSupport(state, true)
      : planDepDiceFocused(state, true)

    state = planUseSetTraining(state)   // Set: guarantee hardest owner-slot die
    state = planOwnerDiceFull(state)    // owners: all remaining dice to owned card
    state = planSideProjectsIfNoDepNeeds(state)

    return state
  }
}

const strategy10 = makeTrainingStrategy(['set', 'set'])
const strategy11 = makeTrainingStrategy(['set'])
const strategy13 = makeTrainingStrategy(['support'])
const strategy14 = makeTrainingStrategy(['set', 'support'])
const strategy15 = makeTrainingStrategy(['support', 'rework'])

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
  { name: 'Competitive / Selfish',          fn: strategy1,       args: [] },
  { name: 'Keep Own Card',                  fn: strategyKeepOwn, args: [] },
  { name: 'Urgent First (WIP ≤ 3)',         fn: strategy4,       args: [3] },
  { name: 'Urgent First (WIP ≤ 4)',         fn: strategy4,       args: [4] },
  { name: 'Completion First (WIP ≤ 3)',     fn: strategy9,       args: [3] },
  { name: 'Completion First (WIP ≤ 4)',     fn: strategy9,       args: [4] },
  { name: 'Train 2P Set',                   fn: strategy10,      args: [] },
  { name: 'Train 1P Set',                   fn: strategy11,      args: [] },
  { name: 'Train 1P Support',               fn: strategy13,      args: [] },
  { name: 'Train 1P Supp + 1P Rework',      fn: strategy15,      args: [] },
  { name: 'Train 2P Set & Support',         fn: strategy14,      args: [] },
]

// ── Diagnostic: analyse one game for training activity ────────────────────────

function diagnoseGame(strategyFn, totalRounds, extraArgs, prebuiltState = null) {
  const playerDefs = ['green', 'blue', 'yellow', 'orange', 'red', 'pink'].map((colour, i) => ({
    id: `player-${i}`, name: colour, colour,
  }))
  let state = prebuiltState ?? createInitialState({ playerDefs, totalRounds })

  // Dice allocation counts (per round, summed across game — divide by totalRounds for per-round avg)
  let lockedDice = 0
  let projectDice = 0       // freshly allocated to project this round (not locked from prev)
  let trainingDice = 0
  let sideProjectDice = 0
  let idleDice = 0           // unallocated and unlocked

  // Completion metrics
  let projectCompletions = 0
  let projectGrossPoints = 0       // sum of card.points before penalties
  let projectPenaltyPoints = 0     // combined urgent penalty (owned + marketplace)
  let ownedUrgentPenalty = 0       // penalty on owned cards only
  let marketplaceUrgentPenalty = 0 // penalty on cards sitting unclaimed in marketplace
  let projectRoundsInPlay = []     // rounds from draw to delivery (inclusive) per completion
  let trainingCompletions = 0
  let trainingCompletionRound = [] // which round each training completed

  // Diagnostic fields
  let urgentOwnedSet = new Set()   // unique urgent project cards ever owned
  let peakLockedDice = 0           // highest locked-dice count in a single round
  let roundsNoCompletion = 0       // rounds where no project was delivered
  let peakDepConcentration = 0     // max projects sharing the same dep colour simultaneously
  let setAbilityUses = 0           // rounds a Set-trained player used the set-die ability
  let supportAbilityUses = 0       // rounds a Support-trained player contributed as dep wildcard
  let reworkAbilityUses = 0        // rounds a Rework-trained player rerolled 2 dice

  let sideProjectSixes = 0
  const roundTeamScores = []   // team score at end of each round (for trajectory)

  while (true) {
    state = strategyFn(state, ...extraArgs)

    // ── Post-plan diagnostics ─────────────────────────────────────────────────
    let roundLocked = 0
    for (const p of state.players) for (const d of p.dice) if (d.locked) roundLocked++
    peakLockedDice = Math.max(peakLockedDice, roundLocked)

    const depCounts = {}
    for (const p of state.players) {
      if (!p.ownedCard) continue
      const dc = findCard(p.ownedCard.cardId).depColour
      depCounts[dc] = (depCounts[dc] || 0) + 1
      if (findCard(p.ownedCard.cardId).urgentPenalty > 0) urgentOwnedSet.add(p.ownedCard.cardId)
    }
    const depVals = Object.values(depCounts)
    if (depVals.length) peakDepConcentration = Math.max(peakDepConcentration, Math.max(...depVals))

    // Count Set ability uses (setDieUsed resets each round via setupNextRound)
    for (const p of state.players) {
      if (p.setDieUsed) setAbilityUses++
    }
    // Count Support ability uses: support-trained player with dice on a non-natural dep project
    for (const p of state.players) {
      if (!p.completedTrainings.includes('support')) continue
      const usedSupport = p.dice.some(d => {
        if (!d.allocatedTo) return false
        const card = findCard(d.allocatedTo)
        if (card?.type !== 'project') return false
        if (card.depColour === p.colour) return false
        return state.players.find(op => op.ownedCard?.cardId === card.id)?.id !== p.id
      })
      if (usedSupport) supportAbilityUses++
    }

    // Snapshot dice after plan phase: locked | fresh-project | training | side | idle
    for (const p of state.players) {
      for (const d of p.dice) {
        if (d.locked) {
          lockedDice++
        } else if (!d.allocatedTo) {
          idleDice++
        } else {
          const card = findCard(d.allocatedTo)
          if (!card) continue
          if (card.type === 'training')         trainingDice++
          else if (card.type === 'project')     projectDice++
          else if (card.type === 'sideProject') sideProjectDice++
        }
      }
    }

    // Capture drawnRound before scoring clears ownedCard on delivery
    const drawnRoundByCard = {}
    for (const p of state.players) {
      if (p.ownedCard) drawnRoundByCard[p.ownedCard.cardId] = p.ownedCard.drawnRound
    }

    state = gameReducer(state, { type: 'ADVANCE_TO_WORK' })
    state = gameReducer(state, { type: 'ROLL_ALL_DICE' })
    state = applyReworkAbility(state)
    for (const p of state.players) { if (p.reworkUsed) reworkAbilityUses++ }

    for (const p of state.players) {
      for (const d of p.dice) {
        if (d.allocatedTo && findCard(d.allocatedTo)?.type === 'sideProject' && d.value === 6) {
          sideProjectSixes++
        }
      }
    }

    state = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })

    const roundEntry = state.roundScores[state.roundScores.length - 1]
    for (const e of roundEntry.entries) {
      if (e.description.startsWith('Training:')) {
        trainingCompletions++
        trainingCompletionRound.push(state.round)
      }
      if (e.description.startsWith('Project delivered:')) {
        projectCompletions++
        const cardId = e.description.replace('Project delivered: ', '')
        projectGrossPoints += e.points   // delivery entry always carries card.points (gross)
        if (drawnRoundByCard[cardId] !== undefined) {
          // Rounds from draw to delivery, inclusive (1 = completed same round as drawn)
          projectRoundsInPlay.push(state.round - drawnRoundByCard[cardId] + 1)
        }
      }
      if (e.description.startsWith('Urgent penalty (marketplace)')) {
        marketplaceUrgentPenalty += Math.abs(e.points)
        projectPenaltyPoints      += Math.abs(e.points)
      } else if (e.description.startsWith('Urgent penalty')) {
        ownedUrgentPenalty    += Math.abs(e.points)
        projectPenaltyPoints  += Math.abs(e.points)
      }
    }

    const completionsThisRound = roundEntry.entries.filter(e => e.description.startsWith('Project delivered:')).length
    if (completionsThisRound === 0) roundsNoCompletion++

    roundTeamScores.push(state.teamScore)
    state = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    if (state.gameOver) break
  }

  const avgProjectRounds = projectRoundsInPlay.length > 0
    ? projectRoundsInPlay.reduce((a, b) => a + b, 0) / projectRoundsInPlay.length
    : null
  const avgTrainingRound = trainingCompletionRound.length > 0
    ? trainingCompletionRound.reduce((a, b) => a + b, 0) / trainingCompletionRound.length
    : null

  return {
    teamScore: state.teamScore,
    roundTeamScores,
    lockedDice, projectDice, trainingDice, sideProjectDice, idleDice,
    projectCompletions, projectGrossPoints, projectPenaltyPoints,
    ownedUrgentPenalty, marketplaceUrgentPenalty, avgProjectRounds,
    trainingCompletions, avgTrainingRound,
    sideProjectSixes,
    urgentOwned: urgentOwnedSet.size,
    peakLockedDice, roundsNoCompletion, peakDepConcentration,
    setAbilityUses, supportAbilityUses, reworkAbilityUses,
  }
}

// ── Seeded initial states — same deck per game across all strategies ──────────

function makePRNG(seed) {
  let s = seed >>> 0
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
}

const RUNS   = 50
const W      = 36

const PLAYER_DEFS = ['green', 'blue', 'yellow', 'orange', 'red', 'pink'].map((colour, i) => ({
  id: `player-${i}`, name: colour, colour,
}))

// Seed only the deck shuffle; dice rolls remain free (independent per strategy).
const gameStates = Array.from({ length: RUNS }, (_, i) => {
  const saved = Math.random
  Math.random = makePRNG(i + 1)
  const s = createInitialState({ playerDefs: PLAYER_DEFS, totalRounds: ROUNDS })
  Math.random = saved
  return s
})

console.log(`\nDependency Game Simulation — ${RUNS} games × ${ROUNDS} rounds × 6 players (matched decks)\n`)

const allData = strategies.map(s => {
  const runs   = gameStates.map(init => diagnoseGame(s.fn, ROUNDS, s.args, init))
  const scores = runs.map(r => r.teamScore)
  const avgNum = f => runs.reduce((a, r) => a + r[f], 0) / runs.length
  const sorted = [...scores].sort((a, b) => a - b)
  const avg    = avgNum('teamScore')
  return {
    name: s.name, runs, scores, avg,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    // Per-round averages (divide raw totals by ROUNDS)
    prjDperRnd: avgNum('projectDice')     / ROUNDS,
    trnDperRnd: avgNum('trainingDice')    / ROUNDS,
    sidDperRnd: avgNum('sideProjectDice') / ROUNDS,
    lckDperRnd: avgNum('lockedDice')      / ROUNDS,
    idlDperRnd: avgNum('idleDice')        / ROUNDS,
    // Per-game totals
    totalPrjDice:  avgNum('projectDice'),
    prjDone:       avgNum('projectCompletions'),
    prjGross:      avgNum('projectGrossPoints'),
    prjPenalty:    avgNum('projectPenaltyPoints'),
    totalTrnDice:  avgNum('trainingDice'),
    trnDone:       avgNum('trainingCompletions'),
    ablUses:       avgNum('setAbilityUses') + avgNum('supportAbilityUses') + avgNum('reworkAbilityUses'),
    totalSideDice: avgNum('sideProjectDice'),
    sidePoints:    avgNum('sideProjectSixes'),
    totalLocked:   avgNum('lockedDice'),
    avgByRound: Array.from({ length: ROUNDS }, (_, r) =>
      runs.reduce((sum, run) => sum + (run.roundTeamScores[r] ?? 0), 0) / runs.length
    ),
    p10:  percentile(scores.sort((a, b) => a - b), 10),
    p25:  percentile(scores, 25),
    p50:  percentile(scores, 50),
    p75:  percentile(scores, 75),
    p90:  percentile(scores, 90),
    std:  Math.sqrt(scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length),
  }
})

// ── 1. Dice allocation (avg per round, should sum to 30) ──────────────────────

console.log('── 1. Dice allocation (avg per round — columns sum to 30) ───────────────\n')
console.log(
  'Strategy'.padEnd(W) +
  ' prjD'.padStart(6) + ' trnD'.padStart(6) + ' sidD'.padStart(6) +
  ' locked'.padStart(8) + '  idle'.padStart(6) + ' total'.padStart(7)
)
console.log('─'.repeat(W + 39))
for (const d of allData) {
  const total = d.prjDperRnd + d.trnDperRnd + d.sidDperRnd + d.lckDperRnd + d.idlDperRnd
  console.log(
    d.name.padEnd(W) +
    d.prjDperRnd.toFixed(1).padStart(6) +
    d.trnDperRnd.toFixed(1).padStart(6) +
    d.sidDperRnd.toFixed(1).padStart(6) +
    d.lckDperRnd.toFixed(1).padStart(8) +
    d.idlDperRnd.toFixed(1).padStart(6) +
    total.toFixed(1).padStart(7)
  )
}

// ── 2a. Completion — Projects (avg per game) ──────────────────────────────────

console.log('\n── 2a. Completion — Projects (avg per game) ─────────────────────────────\n')
console.log(
  'Strategy'.padEnd(W) +
  ' pDice'.padStart(7) + '  done'.padStart(6) + '  gross'.padStart(7) + ' penalty'.padStart(9)
)
console.log('─'.repeat(W + 29))
for (const d of allData) {
  console.log(
    d.name.padEnd(W) +
    d.totalPrjDice.toFixed(0).padStart(7) +
    d.prjDone.toFixed(1).padStart(6) +
    d.prjGross.toFixed(0).padStart(7) +
    d.prjPenalty.toFixed(1).padStart(9)
  )
}

// ── 2b. Completion — Training (avg per game) ──────────────────────────────────

console.log('\n── 2b. Completion — Training (avg per game) ─────────────────────────────\n')
console.log(
  'Strategy'.padEnd(W) +
  ' tDice'.padStart(7) + '  done'.padStart(6) + ' ablUses'.padStart(9)
)
console.log('─'.repeat(W + 22))
for (const d of allData) {
  console.log(
    d.name.padEnd(W) +
    d.totalTrnDice.toFixed(0).padStart(7) +
    d.trnDone.toFixed(1).padStart(6) +
    d.ablUses.toFixed(1).padStart(9)
  )
}

// ── 2c. Completion — Side projects & locking (avg per game) ──────────────────

console.log('\n── 2c. Completion — Side projects & locking (avg per game) ──────────────\n')
console.log(
  'Strategy'.padEnd(W) +
  ' sDice'.padStart(7) + ' sPoints'.padStart(9) + ' totLocked'.padStart(11)
)
console.log('─'.repeat(W + 27))
for (const d of allData) {
  console.log(
    d.name.padEnd(W) +
    d.totalSideDice.toFixed(0).padStart(7) +
    d.sidePoints.toFixed(1).padStart(9) +
    d.totalLocked.toFixed(0).padStart(11)
  )
}

// ── 3. Result KPIs ────────────────────────────────────────────────────────────

console.log('\n── 3. Result KPIs ───────────────────────────────────────────────────────\n')
console.log(
  'Strategy'.padEnd(W) +
  '    avg'.padStart(7) + '  min'.padStart(6) + '  max'.padStart(6)
)
console.log('─'.repeat(W + 19))
for (const d of allData) {
  console.log(
    d.name.padEnd(W) +
    d.avg.toFixed(1).padStart(7) +
    String(d.min).padStart(6) +
    String(d.max).padStart(6)
  )
}

// ── 4. Score distribution (50 games) ─────────────────────────────────────────

console.log('\n── 4. Score distribution (50 games) ────────────────────────────────────\n')
console.log(
  'Strategy'.padEnd(W) +
  '  p10'.padStart(6) + '  p25'.padStart(6) + '  p50'.padStart(6) +
  '  p75'.padStart(6) + '  p90'.padStart(6) + '   std'.padStart(7)
)
console.log('─'.repeat(W + 37))
for (const d of allData) {
  console.log(
    d.name.padEnd(W) +
    String(d.p10).padStart(6) +
    String(d.p25).padStart(6) +
    String(d.p50).padStart(6) +
    String(d.p75).padStart(6) +
    String(d.p90).padStart(6) +
    d.std.toFixed(1).padStart(7)
  )
}

// ── 5. Score progression by round (avg cumulative team score) ─────────────────

const SHORT = [
  'Selfish', 'Keep Own', 'Urgent(3)', 'Urgent(4)',
  'Compl(3)', 'Compl(4)',
  '2P Set', '1P Set', '1P Supp', 'Supp+Rew', 'Set+Supp',
]
const NW = 10
const roundHeaders = Array.from({ length: ROUNDS }, (_, i) => `R${i + 1}`.padStart(5)).join('')
console.log('\n── 5. Score progression by round (avg cumulative team score) ────────────\n')
console.log(' '.repeat(NW) + roundHeaders)
console.log('─'.repeat(NW + ROUNDS * 5))
allData.forEach((d, i) => {
  const row = d.avgByRound.map(v => v.toFixed(1).padStart(5)).join('')
  console.log(SHORT[i].padEnd(NW) + row)
})
