# Facilitator Controls — Design Spec
_2026-05-17_

## Problem

Once a network game is running, the facilitator has no way to intervene. If a player fails to press "Done planning", the entire game stalls. The facilitator needs a small set of privileged levers to keep games moving and to recover from common stuck states.

Secondary goals: Reset support in pass-and-play mode; an architecture that can later accommodate timeboxing and multi-table sync without redesign.

---

## Scope

Four facilitator actions:

| # | Action | Available in |
|---|---|---|
| 1 | Reset game (restart from round 1) | Network + pass-and-play |
| 2 | Force advance to next phase | Network only |
| 3 | Roll all dice | Network only |
| 4 | (Covered by #2) Force next round from Work/Score | Network only |

Actions 2 and 4 are unified: one context-aware "Force advance" button whose label and dispatched action change with the current phase.

---

## Architecture

### Approach: facilitator_dispatch pass-through

The server gets one new message type. All facilitator engine actions pass through `gameReducer` unchanged, except `RESET_GAME` which is handled server-side. The server stays thin; future facilitator features (timers, sync) add new action types without new message types.

---

## Server (`party/game.js`)

**New state:** Store `playerDefs` alongside `gameState` when the game starts.

```js
this.playerDefs = playerEntries.map(...)  // saved at 'start'
this.gameState  = createInitialState({ playerDefs, totalRounds: 12 })
```

**New message case: `facilitator_dispatch`**

1. Reject if sender is not a facilitator (silent drop or error).
2. If `action.type === 'RESET_GAME'`: call `createInitialState({ playerDefs: this.playerDefs, totalRounds: 12 })`, replace `this.gameState`.
3. Otherwise: `this.gameState = gameReducer(this.gameState, action)`.
4. Broadcast `{ type: 'state', state: this.gameState }` to all clients.
5. If the action has a transparency label (see table below), also broadcast `{ type: 'facilitator_event', label }`.

**Transparency labels** (Roll all dice is intentionally omitted — dice results are self-evident on screen):

| action.type | label |
|---|---|
| `RESET_GAME` | "Facilitator reset the game" |
| `ADVANCE_TO_PLAN` | "Facilitator advanced to Planning" |
| `ADVANCE_TO_WORK` | "Facilitator advanced to Work" |
| `ADVANCE_TO_SCORE` | "Facilitator advanced to Scoring" |
| `ADVANCE_TO_NEXT_ROUND` | "Facilitator started the next round" |

---

## NetworkSession (`src/session/NetworkSession.jsx`)

Add `facilitatorDispatch(action)` alongside the existing `dispatch`:

```js
function facilitatorDispatch(action) {
  ws.send(JSON.stringify({ type: 'facilitator_dispatch', action }))
}
```

Handle incoming `facilitator_event` messages: store `label` in a `useState` and pass it down (or via the existing session context) to `GameBoard`.

Expose via session context:
- `facilitatorDispatch` — function, undefined for non-facilitator sessions
- `facilitatorEventLabel` — string | null, latest label (null when no event pending)

---

## GameBoard (`src/components/GameBoard.jsx`)

### Facilitator panel (network mode only, `isFacilitator === true`)

Render a small row of controls in the bottom toolbar area, below the phase label. The panel replaces the existing "nothing" the facilitator sees there.

**Buttons:**

| Button | Condition | Action |
|---|---|---|
| Force → Plan | `phase === 'set'` | `ADVANCE_TO_PLAN` |
| Force → Work | `phase === 'plan'` | `ADVANCE_TO_WORK` |
| Force → Score | `phase === 'work'` | `ADVANCE_TO_SCORE` |
| Force Next Round | `phase === 'score'` | `ADVANCE_TO_NEXT_ROUND` |
| Roll all dice | `phase === 'work'` | `ROLL_ALL_DICE` |
| Reset game | always (non-gameOver) | `RESET_GAME` (confirm first) |

Force advance and Roll all use `facilitatorDispatch`. Reset uses `window.confirm` before dispatching.

When `gameOver`: only Reset is shown.

### Pass-and-play reset

In the existing non-network bottom toolbar, add a Reset button (styled secondary/muted) that calls `window.confirm` then `onNewGame()`. Visible at all times when `!isNetworkMode`.

### Transparency toast

A `facilitatorEventLabel` string is received via props/context. When it changes to a non-null value, show a brief banner (e.g. amber background, centered, 3 s auto-dismiss). Shown to all clients — players and facilitator alike.

Implementation: one `useState(null)` for the label; a `useEffect` that sets a `setTimeout` to clear it after 3000 ms, clearing the previous timeout on each new label.

---

## Engine changes

None required. All actions used (`ADVANCE_TO_PLAN`, `ADVANCE_TO_WORK`, `ADVANCE_TO_SCORE`, `ADVANCE_TO_NEXT_ROUND`, `ROLL_ALL_DICE`) already exist. `RESET_GAME` is handled server-side and never reaches the reducer.

---

## Future extensibility

- **Timeboxing**: server adds a timer per phase; when it fires, server sends itself a `facilitator_dispatch`-equivalent with the appropriate advance action. No new message types needed.
- **Multi-table sync**: a room-group layer at the server sends a broadcast `facilitator_dispatch` to all rooms in the group simultaneously. Same action types, same client code.

---

## Out of scope

- Facilitator taking over a disconnected player's slot (separate feature)
- Per-player facilitator actions (e.g. rolling only one player's dice)
- Undo
