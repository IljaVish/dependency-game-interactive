# Facilitator Proxy & Force-Phase Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the facilitator able to act as any player (same UX as pass-and-play), and make each force-phase button smart about the transition it performs.

**Architecture:** Three changes compose cleanly. (1) Two new engine actions handle auto-resolution on forced phase advances. (2) GameBoard removes the `isObserverMode = isFacilitator` shortcut and instead gates only the facilitator's own phase controls; player-row interaction now works for facilitator identically to pass-and-play via the existing `activePlayerId` mechanism. (3) The facilitator's Force→Plan/Work/Score buttons each get smarter behaviour in the UI.

**Tech Stack:** React 18, Vite, PartyKit (party/game.js), Vitest for engine tests.

---

## File Map

| File | What changes |
|------|-------------|
| `src/game/engine.js` | Add `FORCE_ADVANCE_TO_PLAN` and `FORCE_ADVANCE_TO_SCORE` cases |
| `src/game/engine.test.js` | Tests for both new engine actions |
| `party/game.js` | Add transparency labels for the two new facilitator actions |
| `src/components/GameBoard.jsx` | Fix `isObserverMode`; show player switcher for facilitator; fix `planToWorkWarnings`; rewrite facilitator force buttons; guard network player controls against facilitator |

---

## Task 1: Engine — FORCE_ADVANCE_TO_PLAN

**Files:**
- Modify: `src/game/engine.js` (add case after `ADVANCE_TO_PLAN` around line 806)
- Test: `src/game/engine.test.js`

This action auto-pushes every player's `pendingCards` to the marketplace, zeroes `needsDraw` for all players, and advances to `'plan'`. It is the authoritative resolution for a facilitator forcing past the Set phase.

- [ ] **Step 1: Write the failing test**

Add this describe block at the bottom of `src/game/engine.test.js`:

```js
describe('FORCE_ADVANCE_TO_PLAN', () => {
  it('pushes all pending cards to marketplace and advances to plan', () => {
    const state = makeState({
      phase: 'set',
      players: [
        makePlayer('p1', 'green', { pendingCards: [{ cardId: 'card-a', drawnRound: 1 }], needsDraw: 1 }),
        makePlayer('p2', 'blue',  { pendingCards: [{ cardId: 'card-b', drawnRound: 1 }, { cardId: 'card-c', drawnRound: 1 }], needsDraw: 2 }),
      ],
      marketplace: [],
    })

    const next = gameReducer(state, { type: 'FORCE_ADVANCE_TO_PLAN' })

    expect(next.phase).toBe('plan')
    expect(next.marketplace).toEqual([
      { cardId: 'card-a', drawnRound: 1 },
      { cardId: 'card-b', drawnRound: 1 },
      { cardId: 'card-c', drawnRound: 1 },
    ])
    expect(next.players[0].pendingCards).toEqual([])
    expect(next.players[0].needsDraw).toBe(0)
    expect(next.players[1].pendingCards).toEqual([])
    expect(next.players[1].needsDraw).toBe(0)
  })

  it('advances to plan with no pending cards (edge case: all already decided)', () => {
    const state = makeState({
      phase: 'set',
      players: [
        makePlayer('p1', 'green', { pendingCards: [], needsDraw: 0 }),
      ],
      marketplace: [],
    })

    const next = gameReducer(state, { type: 'FORCE_ADVANCE_TO_PLAN' })

    expect(next.phase).toBe('plan')
    expect(next.marketplace).toEqual([])
  })

  it('preserves existing marketplace entries', () => {
    const state = makeState({
      phase: 'set',
      players: [
        makePlayer('p1', 'green', { pendingCards: [{ cardId: 'card-new', drawnRound: 2 }], needsDraw: 1 }),
      ],
      marketplace: [{ cardId: 'card-old', drawnRound: 1 }],
    })

    const next = gameReducer(state, { type: 'FORCE_ADVANCE_TO_PLAN' })

    expect(next.marketplace).toEqual([
      { cardId: 'card-old', drawnRound: 1 },
      { cardId: 'card-new', drawnRound: 2 },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "FORCE_ADVANCE_TO_PLAN"
```

Expected: 3 failing tests, "FORCE_ADVANCE_TO_PLAN is not a handled action" or default return.

- [ ] **Step 3: Add the engine case**

In `src/game/engine.js`, after the `case 'ADVANCE_TO_PLAN':` block (around line 807), add:

```js
case 'FORCE_ADVANCE_TO_PLAN': {
  // Facilitator force: push every player's pending cards to marketplace, then advance.
  const allPending = state.players.flatMap(p => p.pendingCards)
  const players = state.players.map(p => ({ ...p, pendingCards: [], needsDraw: 0 }))
  return { ...state, players, marketplace: [...state.marketplace, ...allPending], phase: 'plan' }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "FORCE_ADVANCE_TO_PLAN"
```

Expected: all 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/engine.js src/game/engine.test.js
git commit -m "feat(engine): add FORCE_ADVANCE_TO_PLAN — auto-pushes pending cards to market"
```

---

## Task 2: Engine — FORCE_ADVANCE_TO_SCORE

**Files:**
- Modify: `src/game/engine.js` (add case near `ADVANCE_TO_SCORE` around line 836)
- Test: `src/game/engine.test.js`

This action rolls all unset dice, then scores the round — combining `ROLL_ALL_DICE` + `ADVANCE_TO_SCORE` atomically. It is what the Force→Score button dispatches.

- [ ] **Step 1: Write the failing tests**

Add this describe block to `src/game/engine.test.js`:

```js
describe('FORCE_ADVANCE_TO_SCORE', () => {
  it('rolls all unset dice and advances to score phase', () => {
    const state = makeState({
      phase: 'work',
      round: 1,
      totalRounds: 12,
      players: [
        makePlayer('p1', 'green', {
          dice: [
            makeDie('green-0', { value: 4 }),  // already rolled
            makeDie('green-1', { value: null }), // not yet rolled
          ],
        }),
        makePlayer('p2', 'blue', {
          dice: [
            makeDie('blue-0', { value: null }),
            makeDie('blue-1', { value: null }),
          ],
        }),
      ],
      roundScores: [],
    })

    const next = gameReducer(state, { type: 'FORCE_ADVANCE_TO_SCORE' })

    expect(next.phase).toBe('score')
    // All previously-null dice now have values
    expect(next.players[0].dice[1].value).toBeGreaterThanOrEqual(1)
    expect(next.players[0].dice[1].value).toBeLessThanOrEqual(6)
    expect(next.players[1].dice[0].value).toBeGreaterThanOrEqual(1)
    expect(next.players[1].dice[1].value).toBeGreaterThanOrEqual(1)
    // Already-rolled die is unchanged
    expect(next.players[0].dice[0].value).toBe(4)
    // Round was scored
    expect(next.roundScores).toHaveLength(1)
  })

  it('is a no-op when not in work phase', () => {
    const state = makeState({ phase: 'plan', players: [makePlayer('p1', 'green')] })
    const next = gameReducer(state, { type: 'FORCE_ADVANCE_TO_SCORE' })
    expect(next.phase).toBe('plan')
  })

  it('sets gameOver when on the last round', () => {
    const state = makeState({
      phase: 'work',
      round: 12,
      totalRounds: 12,
      players: [makePlayer('p1', 'green')],
      roundScores: [],
    })
    const next = gameReducer(state, { type: 'FORCE_ADVANCE_TO_SCORE' })
    expect(next.phase).toBe('score')
    expect(next.gameOver).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "FORCE_ADVANCE_TO_SCORE"
```

Expected: 3 failing.

- [ ] **Step 3: Add the engine case**

In `src/game/engine.js`, after the `case 'ADVANCE_TO_SCORE':` block (around line 840), add:

```js
case 'FORCE_ADVANCE_TO_SCORE': {
  if (state.phase !== 'work') return state
  // Roll all unset dice, then score
  const players = state.players.map(player => {
    const unset = player.dice.filter(d => d.value === null)
    const rolled = rollDice(unset.length)
    let i = 0
    return { ...player, dice: player.dice.map(d => d.value === null ? { ...d, value: rolled[i++] } : d) }
  })
  const withRolls = applyWorkMatches({ ...state, players })
  const scored = scoreRound(withRolls)
  const gameOver = state.round >= state.totalRounds
  return { ...scored, phase: 'score', gameOver }
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/game/engine.js src/game/engine.test.js
git commit -m "feat(engine): add FORCE_ADVANCE_TO_SCORE — rolls all dice then scores"
```

---

## Task 3: Server — transparency labels for new actions

**Files:**
- Modify: `party/game.js` (the `FACILITATOR_LABELS` object around line 111)

- [ ] **Step 1: Update FACILITATOR_LABELS**

In `party/game.js`, replace the existing `FACILITATOR_LABELS` object with:

```js
const FACILITATOR_LABELS = {
  RESET_GAME:              'Facilitator reset the game',
  FORCE_ADVANCE_TO_PLAN:   'Facilitator advanced to Planning (pending cards sent to market)',
  ADVANCE_TO_WORK:         'Facilitator advanced to Work',
  FORCE_ADVANCE_TO_SCORE:  'Facilitator advanced to Scoring (all dice rolled)',
  ADVANCE_TO_NEXT_ROUND:   'Facilitator started the next round',
}
```

Note: `ADVANCE_TO_PLAN` (old plain Set→Plan label) is removed because the facilitator now always sends `FORCE_ADVANCE_TO_PLAN` for that transition.

- [ ] **Step 2: Verify server restarts cleanly (PartyKit dev server should pick up the change)**

In the terminal running `npm run party:dev`, confirm no build errors appear after saving.

- [ ] **Step 3: Commit**

```bash
git add party/game.js
git commit -m "feat(server): update facilitator transparency labels for new force actions"
```

---

## Task 4: GameBoard — facilitator acts as player (proxy mode)

**Files:**
- Modify: `src/components/GameBoard.jsx`

This task removes the `isObserverMode = isFacilitator` shortcut that blocks all player interactions for the facilitator. After this change, the facilitator has a player switcher (identical to pass-and-play) and can interact with any player's row.

Four small edits to `GameBoard.jsx`:

**Edit A** — Remove the observer alias.

- [ ] **Step 1: Change `isObserverMode`**

Find line 72:
```js
  const isObserverMode = isFacilitator
```
Replace with:
```js
  const isObserverMode = false
```

**Edit B** — `planToWorkWarnings`: facilitator should see ALL players, not just "my player".

- [ ] **Step 2: Fix planToWorkWarnings for facilitator**

Find lines 280–291:
```js
  const planToWorkWarnings = phase === 'plan'
    ? isNetworkMode
      ? (() => {
          const myP = players[myPlayerIndex]
          const n = myP ? myP.dice.filter(d => !d.locked && d.allocatedTo === null).length : 0
          return n > 0 ? [`You have ${n} unallocated dice.`] : []
        })()
      : players.flatMap(p => {
          const n = p.dice.filter(d => !d.locked && d.allocatedTo === null).length
          return n > 0 ? [`${p.name} has ${n} unallocated dice.`] : []
        })
    : []
```
Replace with:
```js
  const planToWorkWarnings = phase === 'plan'
    ? (isNetworkMode && !isFacilitator)
      ? (() => {
          const myP = players[myPlayerIndex]
          const n = myP ? myP.dice.filter(d => !d.locked && d.allocatedTo === null).length : 0
          return n > 0 ? [`You have ${n} unallocated dice.`] : []
        })()
      : players.flatMap(p => {
          const n = p.dice.filter(d => !d.locked && d.allocatedTo === null).length
          return n > 0 ? [`${p.name} has ${n} unallocated dice.`] : []
        })
    : []
```

**Edit C** — Guard network player controls against facilitator.

- [ ] **Step 3: Exclude facilitator from network player controls**

Find line 391:
```js
          {isNetworkMode && !isObserverMode && !gameOver && (
```
Replace with:
```js
          {isNetworkMode && !isFacilitator && !gameOver && (
```

Also find line 331 (Roll all dice button, network check) — it's already gated by `!isNetworkMode` so no change needed there.

**Edit D** — Show player switcher for facilitator too.

- [ ] **Step 4: Show player switcher for facilitator**

Find line 607:
```js
          {/* Player switcher — only in pass-and-play */}
          {!isNetworkMode && !isObserverMode && (
```
Replace with:
```js
          {/* Player switcher — pass-and-play and facilitator */}
          {(!isNetworkMode || isFacilitator) && (
```

- [ ] **Step 5: Verify manually**

Start both servers if not running:
```bash
# Terminal 1
npm run party:dev

# Terminal 2  
npm run dev
```

Open `http://localhost:5173/` in two tabs. Tab 1: join as Facilitator. Tab 2: join as a player. Start the game.

In the facilitator tab:
- Player switcher should be visible with all player names
- Clicking a player name highlights their row as active
- In Set phase: keep/push buttons on the active player's row should work
- In Plan phase: die selection and card allocation should work on the active player's row
- Player rows for non-active players remain non-interactive

- [ ] **Step 6: Commit**

```bash
git add src/components/GameBoard.jsx
git commit -m "feat(GameBoard): facilitator acts as proxy player — same UX as pass-and-play"
```

---

## Task 5: GameBoard — Smart force-phase buttons

**Files:**
- Modify: `src/components/GameBoard.jsx`

Three changes to the facilitator force buttons:

1. **Set→Plan**: dispatch `FORCE_ADVANCE_TO_PLAN` (not `ADVANCE_TO_PLAN`)
2. **Plan→Work**: check `planToWorkWarnings` first; show inline warning with Force anyway / Cancel
3. **Work→Score**: dispatch `FORCE_ADVANCE_TO_SCORE` (not `ADVANCE_TO_SCORE`); keep standalone Roll All Dice button

- [ ] **Step 1: Update NEXT_ACTION map**

Find lines 17–22:
```js
const NEXT_ACTION = {
  set:   'ADVANCE_TO_PLAN',
  plan:  'ADVANCE_TO_WORK',
  work:  'ADVANCE_TO_SCORE',
  score: 'ADVANCE_TO_NEXT_ROUND',
}
```
Replace with:
```js
const NEXT_ACTION = {
  set:   'FORCE_ADVANCE_TO_PLAN',
  plan:  'ADVANCE_TO_WORK',
  work:  'FORCE_ADVANCE_TO_SCORE',
  score: 'ADVANCE_TO_NEXT_ROUND',
}
```

- [ ] **Step 2: Replace the facilitator controls block**

Find the entire facilitator controls block (lines 459–494, approximately):
```jsx
          {/* Facilitator controls (network mode) */}
          {isFacilitator && !gameOver && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => facilitatorDispatch({ type: NEXT_ACTION[phase] })}
                className="bg-violet-600 hover:bg-violet-500 active:bg-violet-700 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
              >
                {FORCE_LABEL[phase]}
              </button>
              {phase === 'work' && (
                <button
                  onClick={() => facilitatorDispatch({ type: 'ROLL_ALL_DICE' })}
                  className="bg-orange-600 hover:bg-orange-500 active:bg-orange-700 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                >
                  Roll all dice
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm('Reset the game? This will restart from round 1.')) {
                    facilitatorDispatch({ type: 'RESET_GAME' })
                  }
                }}
                className="bg-red-700 hover:bg-red-600 active:bg-red-800 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
              >
                Reset
              </button>
            </div>
          )}
          {isFacilitator && gameOver && (
            <button
              onClick={() => {
                if (window.confirm('Reset the game? This will restart from round 1.')) {
                  facilitatorDispatch({ type: 'RESET_GAME' })
                }
              }}
              className="bg-red-700 hover:bg-red-600 active:bg-red-800 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
            >
              Reset
            </button>
          )}
```

Replace with:

```jsx
          {/* Facilitator controls (network mode) */}
          {isFacilitator && !gameOver && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Plan→Work: show warning if players have unallocated dice */}
              {phase === 'plan' && advancePending ? (
                <>
                  <span className="text-xs text-yellow-300">{planToWorkWarnings.join(' · ')}</span>
                  <button
                    onClick={() => { facilitatorDispatch({ type: 'ADVANCE_TO_WORK' }); setAdvancePending(false) }}
                    className="bg-violet-600 hover:bg-violet-500 px-3 py-1.5 rounded-lg font-semibold text-xs cursor-pointer"
                  >
                    Force anyway
                  </button>
                  <button onClick={() => setAdvancePending(false)}
                    className="text-xs text-gray-400 hover:text-white cursor-pointer">
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (phase === 'plan' && planToWorkWarnings.length > 0) {
                      setAdvancePending(true)
                    } else {
                      facilitatorDispatch({ type: NEXT_ACTION[phase] })
                    }
                  }}
                  className="bg-violet-600 hover:bg-violet-500 active:bg-violet-700 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                >
                  {FORCE_LABEL[phase]}
                </button>
              )}
              {phase === 'work' && (
                <button
                  onClick={() => facilitatorDispatch({ type: 'ROLL_ALL_DICE' })}
                  className="bg-orange-600 hover:bg-orange-500 active:bg-orange-700 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                >
                  Roll all dice
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm('Reset the game? This will restart from round 1.')) {
                    facilitatorDispatch({ type: 'RESET_GAME' })
                  }
                }}
                className="bg-red-700 hover:bg-red-600 active:bg-red-800 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
              >
                Reset
              </button>
            </div>
          )}
          {isFacilitator && gameOver && (
            <button
              onClick={() => {
                if (window.confirm('Reset the game? This will restart from round 1.')) {
                  facilitatorDispatch({ type: 'RESET_GAME' })
                }
              }}
              className="bg-red-700 hover:bg-red-600 active:bg-red-800 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
            >
              Reset
            </button>
          )}
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 4: Manual end-to-end test**

Using two browser tabs (facilitator + 1 player):

**Set phase:**
- Give player a pending card (drawn automatically at round start)
- Facilitator clicks "Force → Plan" without the player deciding
- Expected: pending card appears in marketplace; game moves to Plan phase
- Expected: transparency toast "Facilitator advanced to Planning (pending cards sent to market)"

**Plan phase (no unallocated dice):**
- Player has all dice allocated
- Facilitator clicks "Force → Work"
- Expected: immediate advance, no warning

**Plan phase (unallocated dice):**
- Player has 3 unallocated dice
- Facilitator clicks "Force → Work"
- Expected: warning banner shows "PlayerName has 3 unallocated dice." + "Force anyway" + "Cancel"
- Click "Cancel" → warning disappears, still in Plan
- Click "Force anyway" → game moves to Work phase

**Work phase:**
- Some dice unrolled
- Facilitator clicks "Force → Score"
- Expected: all dice roll, scoring runs, game moves to Score phase
- Expected: transparency toast "Facilitator advanced to Scoring (all dice rolled)"
- Also verify standalone "Roll all dice" button still works (rolls without advancing)

**Facilitator proxy:**
- In Plan phase, select a player from the switcher
- Select a die, click a card — allocation should complete
- Switch to another player, repeat

- [ ] **Step 5: Commit**

```bash
git add src/components/GameBoard.jsx
git commit -m "feat(GameBoard): smart force-phase buttons — auto-resolve, warnings, proxy player"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| Set→Plan force: auto-push pending cards to market | Task 1 (engine), Task 5 (NEXT_ACTION update) |
| Plan→Work force: show per-player unallocated dice warning | Task 4 (planToWorkWarnings fix), Task 5 (button UI) |
| Plan→Work force: facilitator can proceed or cancel | Task 5 |
| Work→Score force: roll all dice first | Task 2 (engine), Task 5 (NEXT_ACTION update) |
| Standalone "Roll all dice" button stays | Task 5 (preserved in new block) |
| Facilitator can act as any player | Task 4 |
| Player 1 active by default for facilitator | Task 4 (existing `activePlayerId` default unchanged) |
| No explicit "deselect to observer" needed | Task 4 (no changes to default logic) |
| Score→Next Round: unchanged | Task 5 (NEXT_ACTION.score unchanged) |
| Transparency toasts for new actions | Task 3 |

**Placeholder scan:** No TBDs or vague steps. All code shown in full.

**Type consistency:** `FORCE_ADVANCE_TO_PLAN` and `FORCE_ADVANCE_TO_SCORE` match between engine, server labels, and NEXT_ACTION map. `advancePending` reused consistently (same state var, same reset pattern as existing pass-and-play warning). `planToWorkWarnings` format (`"Name has N unallocated dice."`) consistent between pass-and-play branch and new facilitator display.
