# Facilitator Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the facilitator privileged levers (force advance, roll all dice, reset) to unstick network games; add a pass-and-play reset button; show a transparency toast to all clients when the facilitator advances a phase or resets.

**Architecture:** One new server message type (`facilitator_dispatch`) passes engine actions through `gameReducer` unchanged, except `RESET_GAME` which re-creates state from stored player defs. NetworkSession adds `facilitatorDispatch` and surfaces `facilitatorEventLabel` via context. GameBoard renders a facilitator panel and a 3-second toast.

**Tech Stack:** React 18, PartyKit (Cloudflare Workers), Vite, Tailwind CSS v4, Vitest

---

## File Map

| File | Change |
|---|---|
| `party/game.js` | Store playerDefs; add `facilitator_dispatch` case + label map |
| `src/session/NetworkSession.jsx` | Add `facilitatorDispatch`; handle `facilitator_event`; expose via context |
| `src/components/GameBoard.jsx` | Facilitator panel; pass-and-play reset; transparency toast |

---

## Task 1: Server — store playerDefs + handle facilitator_dispatch

**Files:**
- Modify: `party/game.js`

- [ ] **Step 1: Store playerDefs when the game starts**

In the `case 'start':` block, save `playerDefs` to `this.playerDefs` immediately before calling `createInitialState`. Full updated block:

```js
case 'start': {
  const senderEntry = this.lobby.find(p => p.connId === sender.id)
  if (!senderEntry || senderEntry.role !== 'facilitator') {
    sender.send(JSON.stringify({ type: 'error', message: 'Only facilitators can start the game' }))
    return
  }
  const playerEntries = this.lobby.filter(p => p.role === 'player')
  if (playerEntries.length < 4) {
    sender.send(JSON.stringify({ type: 'error', message: 'Need at least 4 players to start' }))
    return
  }
  const playerDefs = playerEntries.map((p, i) => ({
    id: `p${i + 1}`,
    name: p.name,
    colour: p.colour,
  }))
  this.playerDefs = playerDefs
  this.gameState = createInitialState({ playerDefs, totalRounds: 12 })
  this.party.broadcast(JSON.stringify({ type: 'state', state: this.gameState }))
  break
}
```

- [ ] **Step 2: Add the transparency label map and facilitator_dispatch case**

Add after the `case 'dispatch':` block (before the closing `}`):

```js
case 'facilitator_dispatch': {
  if (!this.gameState) return
  const senderEntry = this.lobby.find(p => p.connId === sender.id)
  if (!senderEntry || senderEntry.role !== 'facilitator') return

  const FACILITATOR_LABELS = {
    RESET_GAME:            'Facilitator reset the game',
    ADVANCE_TO_PLAN:       'Facilitator advanced to Planning',
    ADVANCE_TO_WORK:       'Facilitator advanced to Work',
    ADVANCE_TO_SCORE:      'Facilitator advanced to Scoring',
    ADVANCE_TO_NEXT_ROUND: 'Facilitator started the next round',
  }

  if (msg.action.type === 'RESET_GAME') {
    this.gameState = createInitialState({ playerDefs: this.playerDefs, totalRounds: 12 })
  } else {
    this.gameState = gameReducer(this.gameState, msg.action)
  }

  this.party.broadcast(JSON.stringify({ type: 'state', state: this.gameState }))

  const label = FACILITATOR_LABELS[msg.action.type]
  if (label) {
    this.party.broadcast(JSON.stringify({ type: 'facilitator_event', label }))
  }
  break
}
```

- [ ] **Step 3: Verify the server starts without errors**

```bash
npm run party:dev
```

Expected: `[pk:inf] Ready on http://0.0.0.0:1999` — no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add party/game.js
git commit -m "feat: server — store playerDefs, add facilitator_dispatch with RESET_GAME and transparency events"
```

---

## Task 2: NetworkSession — facilitatorDispatch + facilitator_event

**Files:**
- Modify: `src/session/NetworkSession.jsx`

- [ ] **Step 1: Add facilitatorEventLabel state**

After the existing `const [errorMsg, setErrorMsg] = useState(null)` line, add:

```js
const [facilitatorEventLabel, setFacilitatorEventLabel] = useState(null)
```

- [ ] **Step 2: Handle facilitator_event in the message listener**

Inside the `socket.addEventListener('message', ...)` handler, after the existing four `if` lines, add:

```js
if (msg.type === 'facilitator_event') setFacilitatorEventLabel(msg.label)
```

- [ ] **Step 3: Add facilitatorDispatch function**

After the existing `dispatch` function, add:

```js
function facilitatorDispatch(action) {
  socketRef.current?.send(JSON.stringify({ type: 'facilitator_dispatch', action }))
}
```

- [ ] **Step 4: Expose both new values in the context Provider**

Update the `<GameSessionContext.Provider value={{...}}>` to include two new keys:

```jsx
<GameSessionContext.Provider value={{
  state: gameState,
  dispatch,
  onNewGame,
  myPlayerIndex: isFacilitator ? null : playerIndex,
  isFacilitator,
  facilitatorDispatch: isFacilitator ? facilitatorDispatch : undefined,
  facilitatorEventLabel,
}}>
  {children}
</GameSessionContext.Provider>
```

- [ ] **Step 2: Verify dev server builds cleanly**

```bash
npm run dev
```

Expected: Vite ready, no TypeScript/lint errors in terminal.

- [ ] **Step 3: Commit**

```bash
git add src/session/NetworkSession.jsx
git commit -m "feat: NetworkSession — facilitatorDispatch + facilitator_event label in context"
```

---

## Task 3: GameBoard — facilitator panel + pass-and-play reset + toast

**Files:**
- Modify: `src/components/GameBoard.jsx`

- [ ] **Step 1: Pull facilitatorDispatch and facilitatorEventLabel from context**

Change the destructuring at the top of `GameBoard` (line ~63):

```js
const { state, dispatch, onNewGame, myPlayerIndex, isFacilitator, facilitatorDispatch, facilitatorEventLabel } = useGameSession()
```

- [ ] **Step 2: Add toast state + auto-dismiss effect**

Add after the existing `useState` declarations (around line ~90):

```js
const [toastLabel, setToastLabel] = useState(null)

useEffect(() => {
  if (!facilitatorEventLabel) return
  setToastLabel(facilitatorEventLabel)
  const id = setTimeout(() => setToastLabel(null), 3000)
  return () => clearTimeout(id)
}, [facilitatorEventLabel])
```

- [ ] **Step 3: Add FORCE_LABEL map alongside the existing NEXT_LABEL map**

Add after the existing `NEXT_LABEL` constant (around line ~27):

```js
const FORCE_LABEL = {
  set:   'Force → Plan',
  plan:  'Force → Work',
  work:  'Force → Score',
  score: 'Force Next Round',
}
```

- [ ] **Step 4: Render the toast**

Add as the first element inside the top-level `<div>` returned by `GameBoard` (before the header div):

```jsx
{/* Facilitator transparency toast */}
{toastLabel && (
  <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-600 text-white px-6 py-3 rounded-xl shadow-lg text-sm font-semibold pointer-events-none">
    {toastLabel}
  </div>
)}
```

- [ ] **Step 5: Add facilitator panel in the bottom toolbar (network mode)**

In the bottom toolbar `<div className="flex items-center gap-3">`, add the facilitator panel **after** the existing network player controls block (after the closing `</>` of `{isNetworkMode && !isObserverMode && ...}`):

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

- [ ] **Step 6: Add pass-and-play Reset button**

In the same toolbar, inside the `{!isNetworkMode && !isObserverMode && ...}` block, add a Reset button after the existing advance button/pending state. The whole block becomes:

```jsx
{!isNetworkMode && !isObserverMode && (
  <>
    {!gameOver && (
      advancePending
        ? <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-yellow-300">{planToWorkWarnings.join(' ')}</span>
            <button onClick={handleAdvancePhase}
              className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer">
              Start Work anyway
            </button>
            <button onClick={() => setAdvancePending(false)}
              className="text-sm text-gray-400 hover:text-white cursor-pointer">Cancel</button>
          </div>
        : <button
            onClick={handleAdvancePhase}
            className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
          >
            {NEXT_LABEL[phase]}
          </button>
    )}
    <button
      onClick={() => {
        if (window.confirm('Reset the game? This will restart from round 1.')) {
          onNewGame()
        }
      }}
      className="bg-gray-600 hover:bg-gray-500 active:bg-gray-700 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
    >
      Reset
    </button>
  </>
)}
```

- [ ] **Step 7: Smoke-test in the browser**

Start both servers (`npm run dev` + `npm run party:dev`). Open http://localhost:5173.

**Pass-and-play:**
- Start a game, confirm Reset button appears, click it, confirm dialog appears, confirm → game restarts.

**Network:**
- Open two tabs: one join as facilitator, 4+ as players. Start the game.
- As facilitator: verify the violet Force button and Roll all dice (in work phase) and Reset appear.
- Click Force → Work in Plan phase. Verify players see the amber "Facilitator advanced to Work" toast for ~3 s.
- Click Roll all dice in Work phase. Verify dice roll for all players, no toast.
- Click Reset → confirm → verify all clients return to round 1.

- [ ] **Step 8: Commit**

```bash
git add src/components/GameBoard.jsx
git commit -m "feat: GameBoard — facilitator panel, pass-and-play reset, transparency toast"
```
