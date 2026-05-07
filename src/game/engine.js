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
//     ownedCard: null | { cardId: string, drawnRound: number }
//     pendingCard: null | { cardId: string, drawnRound: number }
//                            (drawn this round, not yet decided to keep or put to marketplace)
//     completedTrainings: string[]    (training type keys: 'rework', 'support', 'set')
//     reworkUsed: boolean    (reroll-2 ability, resets each round)
//     setDieUsed: boolean    (set-1-die ability, resets each round)
//     needsDraw: boolean     (true = player draws one card this Set phase; starts true for all players in round 1,
  //                          set true only when a project is delivered, never for training/side-project completions)
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

// Automatically deals a pending card to every player whose needsDraw flag is set.
// Called at the start of each round (including round 1) so the Set phase begins
// with cards already in hand — no manual "Draw" action needed.
function autoDraw(state) {
  let s = state
  for (const player of s.players) {
    if (!player.needsDraw || player.pendingCard) continue
    const [cardId, newDeck] = drawFromDeck(s.deck)
    if (!cardId) continue
    s = {
      ...s,
      deck: newDeck,
      players: s.players.map(p =>
        p.id === player.id
          ? { ...p, pendingCard: { cardId, drawnRound: s.round } }
          : p
      ),
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
    ownedCard: null,
    pendingCard: null,
    completedTrainings: [],
    reworkUsed: false,
    setDieUsed: false,
    needsDraw: true,
  }))

  return autoDraw({
    phase: 'set',
    round: 1,
    totalRounds,
    gameOver: false,
    teamScore: 0,
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

// Match required slot values against dice entries, accounting for already-locked dice.
// Locked dice are treated as pre-matched (their values are permanent from a prior round).
// Returns { tolock: dieId[], tofree: dieId[], allSatisfied: boolean }
function matchDiceToSlots(requiredSlots, entries) {
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

      // Training has no partial progress — dice are always freed after each round
      // so the player re-allocates fresh next round with new rolls.
      if (complete && !alreadyHas) {
        updatedPlayer = {
          ...updatedPlayer,
          completedTrainings: [...updatedPlayer.completedTrainings, trainingDef.id],
        }
        entries.push({ playerId: player.id, description: `Training: ${trainingDef.label}`, points: 0 })
      }
      updatedPlayer = updateDiceWhere(
        updatedPlayer,
        d => dice.some(td => td.id === d.id),
        d => ({ ...d, allocatedTo: null, locked: false })
      )
    }

    return updatedPlayer
  })

  // ── Owned card urgent penalties ───────────────────────────────────────────────
  // Applied regardless of whether any dice are currently allocated to the card.
  for (const player of players) {
    if (!player.ownedCard) continue
    const card = findCard(player.ownedCard.cardId)
    if (card.urgentPenalty > 0 && round > player.ownedCard.drawnRound) {
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
    const ownerPlayer = players.find(p => p.ownedCard?.cardId === cardId)
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
          ? { ...p, totalScore: p.totalScore + card.points, ownedCard: null, needsDraw: true }
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

  return autoDraw({
    ...state,
    phase: 'set',
    round: nextRound,
    gameOver,
    players,
  })
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function gameReducer(state, action) {
  switch (action.type) {

    // ── Set phase ──────────────────────────────────────────────────────────────

    case 'DRAW_CARD': {
      // action: { playerId }
      // Player draws the top card from the deck. Only allowed when needsDraw is true
      // and no pending card is already held. Each player draws at most once per Set phase.
      const player = state.players.find(p => p.id === action.playerId)
      if (!player?.needsDraw || player.pendingCard !== null) return state
      const [cardId, newDeck] = drawFromDeck(state.deck)
      if (!cardId) return state
      return updatePlayer(
        { ...state, deck: newDeck },
        action.playerId,
        p => ({ ...p, pendingCard: { cardId, drawnRound: state.round } })
      )
    }

    case 'KEEP_CARD': {
      // action: { playerId }
      // Player keeps their pendingCard as ownedCard (replaces any current ownedCard back to deck).
      const player = state.players.find(p => p.id === action.playerId)
      if (!player?.pendingCard) return state
      const pendingCardData = findCard(player.pendingCard.cardId)
      if (pendingCardData?.type === 'project' && pendingCardData.depColour === player.colour) return state

      let newDeck = state.deck
      let newMarketplace = state.marketplace

      if (player.ownedCard) {
        // Return current owned card to bottom of deck
        newDeck = [...state.deck, player.ownedCard.cardId]
      }

      return updatePlayer(
        { ...state, deck: newDeck, marketplace: newMarketplace },
        action.playerId,
        p => ({
          ...p,
          ownedCard: p.pendingCard,
          pendingCard: null,
          needsDraw: false,
        })
      )
    }

    case 'PUT_TO_MARKETPLACE': {
      // action: { playerId }
      // Player puts pendingCard into the marketplace. This ends their Set phase for the round —
      // they do NOT draw again. If they want a project this round, they take one from the
      // marketplace during the Plan phase.
      const player = state.players.find(p => p.id === action.playerId)
      if (!player?.pendingCard) return state

      return updatePlayer(
        {
          ...state,
          marketplace: [...state.marketplace, player.pendingCard],
        },
        action.playerId,
        p => ({ ...p, pendingCard: null, needsDraw: false })
      )
    }

    case 'TAKE_FROM_MARKETPLACE': {
      // action: { playerId, cardId }
      // Player takes a card from the marketplace as their ownedCard.
      const player = state.players.find(p => p.id === action.playerId)
      const entry = state.marketplace.find(e => e.cardId === action.cardId)
      if (!entry) return state

      let newDeck = state.deck
      if (player.ownedCard) {
        newDeck = [...state.deck, player.ownedCard.cardId]
      }

      return updatePlayer(
        {
          ...state,
          deck: newDeck,
          marketplace: state.marketplace.filter(e => e.cardId !== action.cardId),
        },
        action.playerId,
        p => ({ ...p, ownedCard: entry, pendingCard: null, needsDraw: false })
      )
    }

    // ── Plan phase ─────────────────────────────────────────────────────────────

    case 'ALLOCATE_DIE': {
      // action: { playerId, dieId, cardId }
      return updatePlayer(state, action.playerId, p => {
        const die = p.dice.find(d => d.id === action.dieId)
        if (!die || die.locked || die.allocatedTo !== null) return p

        const card = findCard(action.cardId)
        if (!card) return p

        if (card.type === 'training' || card.type === 'sideProject') {
          // Each training/side-project card copy belongs to one player.
          // Reject if any other player already has dice on this card copy.
          const claimed = state.players.some(
            op => op.id !== action.playerId && op.dice.some(d => d.allocatedTo === action.cardId)
          )
          if (claimed) return p
        }

        if (card.type === 'project') {
          const ownerPlayer = state.players.find(op => op.ownedCard?.cardId === action.cardId)
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

    case 'SET_DIE_VALUE': {
      // action: { playerId, dieId, value }
      // Requires 'set' training; sets a die's value without rolling. Once per round.
      return updatePlayer(state, action.playerId, p => {
        if (!p.completedTrainings.includes('set')) return p
        if (p.setDieUsed) return p
        const die = p.dice.find(d => d.id === action.dieId)
        if (!die || die.locked) return p
        return {
          ...updateDie(p, action.dieId, d => ({ ...d, value: action.value })),
          setDieUsed: true,
        }
      })
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
      return { ...state, players }
    }

    case 'USE_REWORK': {
      // action: { playerId, dieIds: [id1, id2] }
      // Rerolls exactly 2 dice. Requires 'rework' training. Once per round.
      return updatePlayer(state, action.playerId, p => {
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
    }

    // ── Phase transitions ──────────────────────────────────────────────────────

    case 'ADVANCE_TO_PLAN':
      return { ...state, phase: 'plan' }

    case 'ADVANCE_TO_WORK':
      return { ...state, phase: 'work' }

    case 'ADVANCE_TO_SCORE': {
      const scored = scoreRound(state)
      return { ...scored, phase: 'score' }
    }

    case 'ADVANCE_TO_NEXT_ROUND':
      return setupNextRound(state)

    case 'END_GAME':
      // Facilitator can end the game after any Score phase.
      return { ...state, gameOver: true }

    default:
      return state
  }
}
