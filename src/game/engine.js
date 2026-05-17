import {
  PROJECT_CARDS,
  SIDE_PROJECT_CARDS,
  TRAINING_CARDS,
  TRAINING_DEFINITIONS,
} from '../data/cards.js'
import {
  rollDice,
  isTrainingComplete,
  scoreSideProject,
  shuffleDeck,
  filterDeckForPlayerCount,
} from './rules.js'

// ─── Card lookup ──────────────────────────────────────────────────────────────

const ALL_CARDS_BY_ID = Object.fromEntries(
  [...PROJECT_CARDS, ...SIDE_PROJECT_CARDS, ...TRAINING_CARDS].map(c => [c.id, c])
)

export function findCard(id) {
  return ALL_CARDS_BY_ID[id] ?? null
}

// ─── State shape ──────────────────────────────────────────────────────────────
//
// {
//   phase: 'set' | 'plan' | 'work' | 'score'
//   round: number          (1-indexed)
//   totalRounds: number
//   gameOver: boolean
//
//   teamScore: number        (the authoritative collaborative score)
//
//   players: [{
//     id: string
//     name: string
//     colour: string         (one of COLOUR_ORDER)
//     totalScore: number
//     dice: [{
//       id: string           (e.g. 'green-0')
//       value: null | 1-6    (null = not yet rolled this round)
//       allocatedTo: null | cardId
//       locked: boolean      (true = die matched a required slot; value is permanent, cannot be reallocated)
//     }]
//     ownedCards: [{ cardId: string, drawnRound: number }]
//                            (array; players can own multiple projects simultaneously)
//     activeTrainingCards: [{ cardId: string }]
//                            (training copies in the player's lane; persists until training completes)
//     pendingCards: [{ cardId: string, drawnRound: number }]
//                            (drawn this round, not yet decided to keep or put to marketplace; normally
//                            one entry, but 2+ when the player delivered multiple projects last round)
//     completedTrainings: string[]    (training type keys: 'rework', 'support', 'set'; active from next round)
//     reworkUsed: boolean    (reroll-2 ability, resets each round)
//     setDieUsed: boolean    (set-1-die ability, resets each round)
//     needsDraw: number      (cards still to draw this Set phase; starts at 1 for all players in round 1,
  //                          increments by 1 each time a project is delivered, never for training/side-project completions)
//   }]
//
//   deck: string[]           (cardIds, top of deck = index 0)
//   marketplace: [{ cardId: string, drawnRound: number }]
//
//   roundScores: [{
//     round: number
//     entries: [{ playerId: string | null, description: string, points: number }]
//                playerId is null for team-level events (marketplace urgent penalties)
//   }]
// }

// ─── Factory ──────────────────────────────────────────────────────────────────

// Automatically deals all pending cards to every player whose needsDraw count exceeds
// their current pendingCards length. Called at the start of each round so the Set phase
// begins with all cards already in hand — no manual "Draw" action needed.
function autoDraw(state) {
  let s = state
  for (const player of state.players) {
    const needed = player.needsDraw - player.pendingCards.length
    if (needed <= 0) continue
    for (let i = 0; i < needed; i++) {
      const [cardId, newDeck] = drawFromDeck(s.deck)
      if (!cardId) break
      s = {
        ...s,
        deck: newDeck,
        players: s.players.map(p =>
          p.id === player.id
            ? { ...p, pendingCards: [...p.pendingCards, { cardId, drawnRound: s.round }] }
            : p
        ),
      }
    }
  }
  return s
}

export function createInitialState({ playerDefs, totalRounds = 12 }) {
  // playerDefs: [{ id, name, colour }]
  const activeColours = playerDefs.map(p => p.colour)
  const filteredProjects = filterDeckForPlayerCount(PROJECT_CARDS, activeColours)
  const deck = shuffleDeck(filteredProjects).map(c => c.id)

  const players = playerDefs.map(def => ({
    id: def.id,
    name: def.name,
    colour: def.colour,
    totalScore: 0,
    dice: Array.from({ length: 5 }, (_, i) => ({
      id: `${def.colour}-${i}`,
      value: null,
      allocatedTo: null,
      locked: false,
    })),
    ownedCards: [],
    pendingCards: [],
    activeTrainingCards: [],
    completedTrainings: [],
    reworkUsed: false,
    setDieUsed: false,
    needsDraw: 1,
  }))

  return autoDraw({
    phase: 'set',
    round: 1,
    totalRounds,
    gameOver: false,
    teamScore: 0,
    planReadyPlayers: [],
    workReadyPlayers: [],
    players,
    deck,
    marketplace: [],
    roundScores: [],
  })
}

// ─── Immutable helpers ────────────────────────────────────────────────────────

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map(p => (p.id === playerId ? updater(p) : p)),
  }
}

function updateDie(player, dieId, updater) {
  return {
    ...player,
    dice: player.dice.map(d => (d.id === dieId ? updater(d) : d)),
  }
}

function updateDiceWhere(player, predicate, updater) {
  return {
    ...player,
    dice: player.dice.map(d => (predicate(d) ? updater(d) : d)),
  }
}

// Draw the top card from the deck; returns [cardId, newDeck] or [null, deck].
function drawFromDeck(deck) {
  if (deck.length === 0) return [null, deck]
  return [deck[0], deck.slice(1)]
}

// ─── Slot matching ────────────────────────────────────────────────────────────

// Exported for unit testing.
// Match required slot values against dice entries, accounting for already-locked dice.
// Locked dice are treated as pre-matched (their values are permanent from a prior round).
// Returns { tolock: dieId[], tofree: dieId[], allSatisfied: boolean }
export function matchDiceToSlots(requiredSlots, entries) {
  const lockedEntries = entries.filter(e => e.die.locked)
  const newEntries    = entries.filter(e => !e.die.locked)

  // Remove slots already covered by locked dice from previous rounds.
  const remaining = [...requiredSlots]
  for (const e of lockedEntries) {
    const i = remaining.indexOf(e.die.value)
    if (i !== -1) remaining.splice(i, 1)
  }

  // Greedily match remaining slots against newly rolled dice.
  const pool   = [...newEntries]
  const tolock = []
  for (const slot of remaining) {
    const i = pool.findIndex(e => e.die.value === slot)
    if (i !== -1) {
      tolock.push(pool[i].die.id)
      pool.splice(i, 1)
    }
  }

  return {
    tolock,
    tofree: pool.map(e => e.die.id),
    allSatisfied: tolock.length === remaining.length,
  }
}

// Exported for unit testing.
// Returns { tolock: dieId[] } — the newly-unlocked dice to lock based on current rolls.
// Accounts for already-locked dice from prior rounds: their slots are removed before matching.
export function matchTrainingDice(trainingDef, diceEntries) {
  const locked = diceEntries.filter(e => e.die.locked)
  const pool   = diceEntries.filter(e => !e.die.locked && e.die.value !== null)
  const tolock = []
  if (trainingDef.slots) {
    // Start with all slots sorted hardest-first; remove those already covered by locked dice.
    const remaining = [...trainingDef.slots].sort((a, b) => b - a)
    for (const e of locked) {
      const idx = remaining.findIndex(minVal => e.die.value >= minVal)
      if (idx !== -1) remaining.splice(idx, 1)
    }
    // Match remaining unsatisfied slots against newly rolled (unlocked) dice.
    const available = [...pool]
    for (const minVal of remaining) {
      const idx = available.findIndex(e => e.die.value >= minVal)
      if (idx !== -1) {
        tolock.push(available[idx].die.id)
        available.splice(idx, 1)
      }
    }
  } else {
    // Subtract already-locked slots so we don't exceed requiredCount.
    const stillNeeded = Math.max(0, trainingDef.requiredCount - locked.length)
    pool
      .filter(e => e.die.value >= trainingDef.requiredMin)
      .slice(0, stillNeeded)
      .forEach(e => tolock.push(e.die.id))
  }
  return { tolock }
}

// ─── Work phase matching ──────────────────────────────────────────────────────

// After rolling, lock any dice that have matched their project card slots.
// Unmatched-but-rolled dice stay allocated (in staging) for potential Rework.
// Only frees dice at Score phase — this function never frees.
function applyWorkMatches(state) {
  const cardIds = new Set()
  state.players.forEach(p =>
    p.dice.forEach(d => {
      if (d.allocatedTo && findCard(d.allocatedTo)?.type === 'project') cardIds.add(d.allocatedTo)
    })
  )

  let players = state.players

  for (const cardId of cardIds) {
    const card = findCard(cardId)
    const ownerPlayer = players.find(p => p.ownedCards.some(oc => oc.cardId === cardId))
    if (!ownerPlayer) continue

    // Only include dice that have been rolled (value !== null) or are already locked.
    const ownerEntries = ownerPlayer.dice
      .filter(d => d.allocatedTo === cardId && (d.locked || d.value !== null))
      .map(d => ({ die: d, player: ownerPlayer }))

    const depEntries = players
      .filter(p => p.id !== ownerPlayer.id)
      .flatMap(p =>
        p.dice
          .filter(d => d.allocatedTo === cardId && (d.locked || d.value !== null))
          .map(d => ({ die: d, player: p }))
      )

    const ownerResult = matchDiceToSlots(card.ownerDice, ownerEntries)
    const depResult   = matchDiceToSlots(card.depDice, depEntries)
    const toLockIds   = new Set([...ownerResult.tolock, ...depResult.tolock])
    if (toLockIds.size === 0) continue

    players = players.map(p => ({
      ...p,
      dice: p.dice.map(d => toLockIds.has(d.id) ? { ...d, locked: true } : d),
    }))
  }

  // Training card matching — collect tasks first, then process with updated players
  const trainingTasks = []
  players.forEach(p =>
    p.activeTrainingCards.forEach(tc => trainingTasks.push({ playerId: p.id, cardId: tc.cardId }))
  )
  for (const { playerId, cardId } of trainingTasks) {
    const trainingKey = cardId.split('-')[1]
    const trainingDef = TRAINING_DEFINITIONS[trainingKey]
    if (!trainingDef) continue
    const ownerPlayer = players.find(p => p.id === playerId)
    if (!ownerPlayer) continue
    const trainingEntries = ownerPlayer.dice
      .filter(d => d.allocatedTo === cardId && (d.locked || d.value !== null))
      .map(d => ({ die: d, player: ownerPlayer }))
    const { tolock } = matchTrainingDice(trainingDef, trainingEntries)
    if (tolock.length === 0) continue
    const toLockIds = new Set(tolock)
    players = players.map(p => ({
      ...p,
      dice: p.dice.map(d => toLockIds.has(d.id) ? { ...d, locked: true } : d),
    }))
  }

  return { ...state, players }
}

// ─── Score phase logic ────────────────────────────────────────────────────────

function scoreRound(state) {
  const { round } = state
  const entries = []
  let teamScore = state.teamScore

  let players = state.players.map(player => {
    let updatedPlayer = { ...player }

    // ── Side project dice ────────────────────────────────────────────────────
    // Always score 1pt per 6, always free dice afterward.
    const sideDice = player.dice.filter(
      d => d.allocatedTo !== null && findCard(d.allocatedTo)?.type === 'sideProject'
    )
    if (sideDice.length > 0) {
      const pts = scoreSideProject(sideDice.map(d => d.value))
      if (pts > 0) {
        entries.push({ playerId: player.id, description: 'Side project', points: pts })
        updatedPlayer = { ...updatedPlayer, totalScore: updatedPlayer.totalScore + pts }
        teamScore += pts
      }
      updatedPlayer = updateDiceWhere(
        updatedPlayer,
        d => sideDice.some(sd => sd.id === d.id),
        d => ({ ...d, allocatedTo: null, locked: false })
      )
    }

    // ── Training dice ────────────────────────────────────────────────────────
    const trainingDiceByCard = {}
    player.dice.forEach(d => {
      if (d.allocatedTo !== null && findCard(d.allocatedTo)?.type === 'training') {
        if (!trainingDiceByCard[d.allocatedTo]) trainingDiceByCard[d.allocatedTo] = []
        trainingDiceByCard[d.allocatedTo].push(d)
      }
    })
    for (const [cardId, dice] of Object.entries(trainingDiceByCard)) {
      const card = findCard(cardId)
      // IDs are like "training-rework-1" → key is the middle segment
      const trainingKey = card.id.split('-')[1]
      const trainingDef = TRAINING_DEFINITIONS[trainingKey]
      if (!trainingDef) continue

      const diceValues = dice.map(d => d.value)
      const complete = isTrainingComplete(trainingDef, diceValues)
      const alreadyHas = updatedPlayer.completedTrainings.includes(trainingDef.id)

      if (complete && !alreadyHas) {
        updatedPlayer = {
          ...updatedPlayer,
          completedTrainings: [...updatedPlayer.completedTrainings, trainingDef.id],
          activeTrainingCards: updatedPlayer.activeTrainingCards.filter(tc => tc.cardId !== cardId),
        }
        entries.push({ playerId: player.id, description: `Training: ${trainingDef.label}`, points: 0 })
        // Free all dice (including locked) once training is completed.
        updatedPlayer = updateDiceWhere(
          updatedPlayer,
          d => dice.some(td => td.id === d.id),
          d => ({ ...d, allocatedTo: null, locked: false })
        )
      } else {
        // Partial progress: locked dice stay allocated for next round; only free unmatched staging dice.
        updatedPlayer = updateDiceWhere(
          updatedPlayer,
          d => dice.some(td => td.id === d.id) && !d.locked,
          d => ({ ...d, allocatedTo: null })
        )
      }
    }

    return updatedPlayer
  })

  // ── Owned card urgent penalties ───────────────────────────────────────────────
  // Applied regardless of whether any dice are currently allocated to the card.
  for (const player of players) {
    for (const ownedEntry of player.ownedCards) {
      const card = findCard(ownedEntry.cardId)
      if (card.urgentPenalty > 0 && round > ownedEntry.drawnRound) {
        entries.push({
          playerId: player.id,
          description: `Urgent penalty: ${card.id}`,
          points: -card.urgentPenalty,
        })
        teamScore -= card.urgentPenalty
        players = players.map(p =>
          p.id === player.id
            ? { ...p, totalScore: p.totalScore - card.urgentPenalty }
            : p
        )
      }
    }
  }

  // ── Project cards: dice scoring ───────────────────────────────────────────────
  // Gather all dice allocated to each project card across all players.
  const diceByCard = {}
  players.forEach(player => {
    player.dice.forEach(d => {
      if (d.allocatedTo !== null && findCard(d.allocatedTo)?.type === 'project') {
        if (!diceByCard[d.allocatedTo]) diceByCard[d.allocatedTo] = []
        diceByCard[d.allocatedTo].push({ die: d, player })
      }
    })
  })

  for (const [cardId, diceEntries] of Object.entries(diceByCard)) {
    const card = findCard(cardId)

    // Find the owner of this card.
    const ownerPlayer = players.find(p => p.ownedCards.some(oc => oc.cardId === cardId))
    if (!ownerPlayer) continue

    // Partition dice: owner's dice vs dependency dice.
    const ownerDiceEntries = diceEntries.filter(e => e.player.id === ownerPlayer.id)
    const depDiceEntries = diceEntries.filter(e => e.player.id !== ownerPlayer.id)

    // Match slots: locked dice are pre-matched from previous rounds.
    const ownerResult = matchDiceToSlots(card.ownerDice, ownerDiceEntries)
    const depResult   = matchDiceToSlots(card.depDice, depDiceEntries)
    const complete    = ownerResult.allSatisfied && depResult.allSatisfied

    if (complete) {
      entries.push({
        playerId: ownerPlayer.id,
        description: `Project delivered: ${card.id}`,
        points: card.points,
      })
      teamScore += card.points
      // Free all dice on the card (including previously locked ones) for all contributing players.
      players = players.map(p => {
        if (p.id !== ownerPlayer.id && !diceEntries.some(e => e.player.id === p.id)) return p
        let updated = p.id === ownerPlayer.id
          ? { ...p, totalScore: p.totalScore + card.points, ownedCards: p.ownedCards.filter(oc => oc.cardId !== cardId), needsDraw: p.needsDraw + 1 }
          : { ...p }
        return updateDiceWhere(updated, d => d.allocatedTo === cardId,
          d => ({ ...d, allocatedTo: null, locked: false }))
      })
    } else {
      // Lock newly matched dice; free dice that rolled but didn't match any slot.
      // Previously locked dice (from prior rounds) are left untouched.
      const toLockIds = new Set([...ownerResult.tolock, ...depResult.tolock])
      const toFreeIds = new Set([...ownerResult.tofree, ...depResult.tofree])
      players = players.map(p => {
        if (!diceEntries.some(e => e.player.id === p.id)) return p
        return {
          ...p,
          dice: p.dice.map(d => {
            if (toLockIds.has(d.id)) return { ...d, locked: true }
            if (toFreeIds.has(d.id)) return { ...d, allocatedTo: null, locked: false }
            return d
          }),
        }
      })
    }
  }

  // ── Marketplace urgent penalties ─────────────────────────────────────────────
  // Penalty clock runs from the round after a card is drawn, even while in the marketplace.
  // No player owns these cards yet, so the deduction comes from the team score only.
  for (const entry of state.marketplace) {
    const card = findCard(entry.cardId)
    if (card.urgentPenalty > 0 && round > entry.drawnRound) {
      teamScore -= card.urgentPenalty
      entries.push({
        playerId: null,
        description: `Urgent penalty (marketplace): ${card.id}`,
        points: -card.urgentPenalty,
      })
    }
  }

  return {
    ...state,
    teamScore,
    players,
    roundScores: [...state.roundScores, { round, entries }],
  }
}

// ─── Round transition ─────────────────────────────────────────────────────────

function setupNextRound(state) {
  const nextRound = state.round + 1
  const gameOver = nextRound > state.totalRounds

  const players = state.players.map(player => ({
    ...player,
    // Locked dice keep their permanent matched value; all others are cleared for re-roll.
    dice: player.dice.map(d => ({ ...d, value: d.locked ? d.value : null })),
    reworkUsed: false,
    setDieUsed: false,
    // needsDraw stays set until player draws in Set phase
  }))

  const next = autoDraw({
    ...state,
    phase: 'set',
    round: nextRound,
    gameOver,
    planReadyPlayers: [],
    workReadyPlayers: [],
    players,
  })
  // If nobody needs to draw, skip set phase entirely.
  return next.players.every(p => p.pendingCards.length === 0)
    ? { ...next, phase: 'plan' }
    : next
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function gameReducer(state, action) {
  switch (action.type) {

    // ── Set phase ──────────────────────────────────────────────────────────────

    case 'DRAW_CARD': {
      // action: { playerId }
      // Player draws the top card from the deck. Only allowed when pending count is below needsDraw.
      const player = state.players.find(p => p.id === action.playerId)
      if (!player?.needsDraw || player.pendingCards.length >= player.needsDraw) return state
      const [cardId, newDeck] = drawFromDeck(state.deck)
      if (!cardId) return state
      return updatePlayer(
        { ...state, deck: newDeck },
        action.playerId,
        p => ({ ...p, pendingCards: [...p.pendingCards, { cardId, drawnRound: state.round }] })
      )
    }

    case 'KEEP_CARD': {
      // action: { playerId, cardId }
      // Player keeps a specific pending card as an owned card.
      const player = state.players.find(p => p.id === action.playerId)
      const pendingEntry = player?.pendingCards.find(pc => pc.cardId === action.cardId)
      if (!pendingEntry) return state
      const pendingCardData = findCard(action.cardId)
      if (pendingCardData?.type === 'project' && pendingCardData.depColour === player.colour) return state

      const next = autoDraw(updatePlayer(
        state,
        action.playerId,
        p => ({
          ...p,
          ownedCards: [...p.ownedCards, { cardId: pendingEntry.cardId, drawnRound: pendingEntry.drawnRound }],
          pendingCards: p.pendingCards.filter(pc => pc.cardId !== action.cardId),
          needsDraw: Math.max(0, p.needsDraw - 1),
        })
      ))
      return next.players.every(p => p.pendingCards.length === 0) ? { ...next, phase: 'plan' } : next
    }

    case 'PUT_TO_MARKETPLACE': {
      // action: { playerId, cardId }
      // Player sends a specific pending card to the marketplace.
      const player = state.players.find(p => p.id === action.playerId)
      const pendingEntry = player?.pendingCards.find(pc => pc.cardId === action.cardId)
      if (!pendingEntry) return state

      const next = autoDraw(updatePlayer(
        { ...state, marketplace: [...state.marketplace, pendingEntry] },
        action.playerId,
        p => ({
          ...p,
          pendingCards: p.pendingCards.filter(pc => pc.cardId !== action.cardId),
          needsDraw: Math.max(0, p.needsDraw - 1),
        })
      ))
      return next.players.every(p => p.pendingCards.length === 0) ? { ...next, phase: 'plan' } : next
    }

    case 'TAKE_FROM_MARKETPLACE': {
      // action: { playerId, cardId }
      // Player takes a card from the marketplace as their ownedCard.
      const player = state.players.find(p => p.id === action.playerId)
      const entry = state.marketplace.find(e => e.cardId === action.cardId)
      if (!entry) return state
      const marketCard = findCard(action.cardId)
      if (marketCard?.type === 'project' && marketCard.depColour === player.colour) return state

      return updatePlayer(
        {
          ...state,
          marketplace: state.marketplace.filter(e => e.cardId !== action.cardId),
        },
        action.playerId,
        p => ({ ...p, ownedCards: [...p.ownedCards, { ...entry, takenRound: state.round }] })
      )
    }

    case 'RETURN_TO_MARKETPLACE': {
      // action: { playerId, cardId }
      // Only allowed if card was taken this round (plan phase) and no dice are allocated to it.
      const player = state.players.find(p => p.id === action.playerId)
      const entry = player?.ownedCards.find(oc => oc.cardId === action.cardId)
      if (!entry || entry.takenRound !== state.round) return state
      if (state.players.some(p => p.dice.some(d => d.allocatedTo === action.cardId))) return state
      return updatePlayer(
        { ...state, marketplace: [...state.marketplace, { cardId: entry.cardId, drawnRound: entry.drawnRound }] },
        action.playerId,
        p => ({ ...p, ownedCards: p.ownedCards.filter(oc => oc.cardId !== action.cardId) })
      )
    }

    // ── Plan phase ─────────────────────────────────────────────────────────────

    case 'CLAIM_TRAINING_CARD': {
      // action: { playerId, cardId }
      // Adds a training card copy to the player's active lane. Rejected if the player
      // already has a copy of the same type active or completed, or if another player
      // has already claimed this exact copy.
      const player = state.players.find(p => p.id === action.playerId)
      if (!player) return state
      const card = findCard(action.cardId)
      if (!card || card.type !== 'training') return state
      const trainingKey = action.cardId.split('-')[1]
      if (player.completedTrainings.includes(trainingKey)) return state
      if (player.activeTrainingCards.some(tc => tc.cardId.split('-')[1] === trainingKey)) return state
      const takenByOther = state.players.some(
        p => p.id !== action.playerId && p.activeTrainingCards.some(tc => tc.cardId === action.cardId)
      )
      if (takenByOther) return state
      return updatePlayer(state, action.playerId, p => ({
        ...p,
        activeTrainingCards: [...p.activeTrainingCards, { cardId: action.cardId, claimedRound: state.round }],
      }))
    }

    case 'UNCLAIM_TRAINING_CARD': {
      // action: { playerId, cardId }
      // Only allowed if claimed this round and no dice are allocated to it.
      const player = state.players.find(p => p.id === action.playerId)
      if (!player) return state
      const tc = player.activeTrainingCards.find(t => t.cardId === action.cardId)
      if (!tc || tc.claimedRound !== state.round) return state
      if (player.dice.some(d => d.allocatedTo === action.cardId)) return state
      return updatePlayer(state, action.playerId, p => ({
        ...p,
        activeTrainingCards: p.activeTrainingCards.filter(t => t.cardId !== action.cardId),
      }))
    }

    case 'ALLOCATE_DIE': {
      // action: { playerId, dieId, cardId }
      return updatePlayer(state, action.playerId, p => {
        const die = p.dice.find(d => d.id === action.dieId)
        if (!die || die.locked || die.allocatedTo !== null) return p

        const card = findCard(action.cardId)
        if (!card) return p

        if (card.type === 'training') {
          // Only allow allocation to a training copy the player has claimed.
          if (!p.activeTrainingCards.some(tc => tc.cardId === action.cardId)) return p
        }
        if (card.type === 'sideProject') {
          // Each side-project copy belongs to one player per round.
          const claimed = state.players.some(
            op => op.id !== action.playerId && op.dice.some(d => d.allocatedTo === action.cardId)
          )
          if (claimed) return p
        }

        if (card.type === 'project') {
          const ownerPlayer = state.players.find(op => op.ownedCards.some(oc => oc.cardId === action.cardId))
          if (ownerPlayer && ownerPlayer.id !== action.playerId) {
            // Non-owner contributing dep dice: must be the dep colour or have Support training.
            if (p.colour !== card.depColour && !p.completedTrainings.includes('support')) return p
          }
        }

        return updateDie(p, action.dieId, d => ({ ...d, allocatedTo: action.cardId }))
      })
    }

    case 'DEALLOCATE_DIE': {
      // action: { playerId, dieId }
      return updatePlayer(state, action.playerId, p => {
        const die = p.dice.find(d => d.id === action.dieId)
        if (!die || die.locked) return p
        return updateDie(p, action.dieId, d => ({ ...d, allocatedTo: null }))
      })
    }

    case 'DEALLOCATE_ALL_NON_LOCKED': {
      // action: { playerId }
      return updatePlayer(state, action.playerId, p => ({
        ...p,
        dice: p.dice.map(d => d.locked ? d : { ...d, allocatedTo: null }),
      }))
    }

    case 'ALLOCATE_ALL_TO_CARD': {
      // action: { playerId, cardId }
      // Allocates all free (unlocked, unallocated) dice of the player to the card.
      // Subject to the same guards as ALLOCATE_DIE.
      return updatePlayer(state, action.playerId, p => {
        const card = findCard(action.cardId)
        if (!card) return p
        if (card.type === 'training') {
          if (!p.activeTrainingCards.some(tc => tc.cardId === action.cardId)) return p
        }
        if (card.type === 'sideProject') {
          const claimed = state.players.some(
            op => op.id !== action.playerId && op.dice.some(d => d.allocatedTo === action.cardId)
          )
          if (claimed) return p
        }
        if (card.type === 'project') {
          const ownerPlayer = state.players.find(op => op.ownedCards.some(oc => oc.cardId === action.cardId))
          if (ownerPlayer && ownerPlayer.id !== action.playerId) {
            if (p.colour !== card.depColour && !p.completedTrainings.includes('support')) return p
          }
        }
        return {
          ...p,
          dice: p.dice.map(d =>
            !d.locked && d.allocatedTo === null ? { ...d, allocatedTo: action.cardId } : d
          ),
        }
      })
    }

    case 'SET_DIE_VALUE': {
      // action: { playerId, dieId, value }
      // Requires 'set' training; sets a die's value without rolling. Once per round.
      return applyWorkMatches(
        updatePlayer(state, action.playerId, p => {
          if (!p.completedTrainings.includes('set')) return p
          if (p.setDieUsed) return p
          const die = p.dice.find(d => d.id === action.dieId)
          if (!die || die.locked) return p
          return {
            ...updateDie(p, action.dieId, d => ({ ...d, value: action.value })),
            setDieUsed: true,
          }
        })
      )
    }

    // ── Work phase ─────────────────────────────────────────────────────────────

    case 'ROLL_ALL_DICE': {
      // Rolls all unset dice for all players simultaneously.
      const players = state.players.map(player => {
        const unsetDice = player.dice.filter(d => d.value === null)
        const rolled = rollDice(unsetDice.length)
        let i = 0
        return {
          ...player,
          dice: player.dice.map(d =>
            d.value === null ? { ...d, value: rolled[i++] } : d
          ),
        }
      })
      return applyWorkMatches({ ...state, players })
    }

    case 'ROLL_PLAYER_DICE': {
      // action: { playerId }
      // Rolls all null-value dice belonging to this player (including those allocated to other players' cards).
      return applyWorkMatches(
        updatePlayer(state, action.playerId, p => {
          const unset = p.dice.filter(d => d.value === null)
          const rolled = rollDice(unset.length)
          let i = 0
          return {
            ...p,
            dice: p.dice.map(d => d.value === null ? { ...d, value: rolled[i++] } : d),
          }
        })
      )
    }

    case 'USE_REWORK': {
      // action: { playerId, dieIds: [id1, id2] }
      // Rerolls exactly 2 dice. Requires 'rework' training. Once per round.
      return applyWorkMatches(
        updatePlayer(state, action.playerId, p => {
          if (!p.completedTrainings.includes('rework')) return p
          if (p.reworkUsed) return p
          if (action.dieIds.length !== 2) return p
          const rerolled = rollDice(2)
          let i = 0
          return {
            ...updateDiceWhere(
              p,
              d => action.dieIds.includes(d.id),
              d => ({ ...d, value: rerolled[i++] })
            ),
            reworkUsed: true,
          }
        })
      )
    }

    // ── Phase transitions ──────────────────────────────────────────────────────

    case 'ADVANCE_TO_PLAN':
      return { ...state, phase: 'plan' }

    case 'ADVANCE_TO_WORK':
      return { ...state, phase: 'work', planReadyPlayers: [], workReadyPlayers: [] }

    case 'PLAYER_DONE_PLANNING': {
      // action: { playerId }
      if (state.phase !== 'plan') return state
      if (state.players.length === 0) return state
      if (state.planReadyPlayers.includes(action.playerId)) return state
      const planReadyPlayers = [...state.planReadyPlayers, action.playerId]
      const allReady = state.players.every(p => planReadyPlayers.includes(p.id))
      if (allReady) return { ...state, planReadyPlayers: [], phase: 'work' }
      return { ...state, planReadyPlayers }
    }

    case 'PLAYER_DONE_WORKING': {
      // action: { playerId }
      if (state.phase !== 'work') return state
      if (state.players.length === 0) return state
      if (state.workReadyPlayers.includes(action.playerId)) return state
      const workReadyPlayers = [...state.workReadyPlayers, action.playerId]
      const allReady = state.players.every(p => workReadyPlayers.includes(p.id))
      if (allReady) {
        return gameReducer({ ...state, workReadyPlayers: [] }, { type: 'ADVANCE_TO_SCORE' })
      }
      return { ...state, workReadyPlayers }
    }

    case 'ADVANCE_TO_SCORE': {
      if (state.phase !== 'work') return state
      const scored = scoreRound(state)
      const gameOver = state.round >= state.totalRounds
      return { ...scored, phase: 'score', gameOver }
    }

    case 'ADVANCE_TO_NEXT_ROUND':
      if (state.phase !== 'score') return state
      return setupNextRound(state)

    case 'END_GAME':
      // Facilitator can end the game after any Score phase.
      return { ...state, gameOver: true }

    default:
      return state
  }
}
