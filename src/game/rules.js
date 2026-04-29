// Pure game logic — no side effects, no state mutation.

// ─── Dice ─────────────────────────────────────────────────────────────────────

export function rollDie() {
  return Math.ceil(Math.random() * 6)
}

export function rollDice(count) {
  return Array.from({ length: count }, rollDie)
}

// ─── Card eligibility ─────────────────────────────────────────────────────────

// A player may not own a project whose dependency colour matches their own colour.
export function canOwnProject(playerColour, card) {
  return card.depColour !== playerColour
}

// ─── Training completion ──────────────────────────────────────────────────────

// Training cards are completed with own-colour dice only.
// requiredCount dice must show a value >= requiredMin.
export function isTrainingComplete(trainingDef, diceValues) {
  const qualifying = diceValues.filter(v => v >= trainingDef.requiredMin)
  return qualifying.length >= trainingDef.requiredCount
}

// ─── Project completion ───────────────────────────────────────────────────────

// A project is complete when every required die slot is satisfied.
// ownerDice and depDice are arrays of exact required values.
// rolledOwner and rolledDep are arrays of rolled (or set) values allocated to this card.
//
// Matching is greedy: each required slot is satisfied by exactly one rolled die
// showing that exact value. Order doesn't matter; a die can only satisfy one slot.
export function isProjectComplete(card, rolledOwner, rolledDep) {
  return (
    allSlotsMatched(card.ownerDice, rolledOwner) &&
    allSlotsMatched(card.depDice, rolledDep)
  )
}

function allSlotsMatched(required, rolled) {
  const available = [...rolled]
  for (const req of required) {
    const idx = available.indexOf(req)
    if (idx === -1) return false
    available.splice(idx, 1)
  }
  return true
}

// ─── Side project scoring ─────────────────────────────────────────────────────

export function scoreSideProject(diceValues) {
  return diceValues.filter(v => v === 6).length
}

// ─── Urgent penalty ───────────────────────────────────────────────────────────

// Penalty accrues each round from the round after drawing through the delivery round (inclusive).
// drawnRound: the round the card was drawn (1-indexed)
// deliveredRound: the round it was completed (1-indexed), or null if still held
// currentRound: used to calculate accrued penalties so far on an unfinished card
export function urgentPenaltyAccrued(card, drawnRound, deliveredRound, currentRound) {
  if (card.urgentPenalty === 0) return 0
  const startPenaltyRound = drawnRound + 1
  const endRound = deliveredRound ?? currentRound
  const rounds = Math.max(0, endRound - startPenaltyRound + 1)
  return rounds * card.urgentPenalty
}

// ─── Score calculation ────────────────────────────────────────────────────────

// Calculate the net score for delivering a project this round.
export function scoreProjectDelivery(card, drawnRound, deliveredRound) {
  const penalty = urgentPenaltyAccrued(card, drawnRound, deliveredRound, deliveredRound)
  return card.points - penalty
}

// ─── Deck helpers ─────────────────────────────────────────────────────────────

export function shuffleDeck(cards) {
  const deck = [...cards]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

// Remove project cards whose depColour is not in the active player colour set.
export function filterDeckForPlayerCount(projectCards, activeColours) {
  return projectCards.filter(card => activeColours.includes(card.depColour))
}
