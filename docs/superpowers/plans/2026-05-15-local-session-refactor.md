# LocalSession Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract game state and dispatch out of `App.jsx` into a `LocalSession` context provider, so UI components read from a `useGameSession()` hook instead of props — laying the groundwork for a future `NetworkSession` drop-in.

**Architecture:** A `GameSessionContext` holds `{ state, dispatch, onNewGame }`. `LocalSession` wraps the existing `useReducer` call and provides that context. `GameBoard` stops receiving `state`/`dispatch` as props and reads them from the hook instead. UI-only state (selected die, work modes, active player) stays local in `GameBoard`.

**Tech Stack:** React 18, Vite, Vitest (no React Testing Library — component tests not applicable here)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/session/GameSessionContext.jsx` | Context object + `useGameSession()` hook |
| Create | `src/session/LocalSession.jsx` | Provider: wraps `useReducer`, exposes context |
| Modify | `src/App.jsx` | Replace inline `useReducer` with `<LocalSession>` |
| Modify | `src/components/GameBoard.jsx` | Remove props, use `useGameSession()` |

---

### Task 1: Create the session context and hook

**Files:**
- Create: `src/session/GameSessionContext.jsx`

- [ ] **Step 1: Create the file**

```jsx
import { createContext, useContext } from 'react'

export const GameSessionContext = createContext(null)

export function useGameSession() {
  const ctx = useContext(GameSessionContext)
  if (!ctx) throw new Error('useGameSession must be used inside a session provider')
  return ctx
}
```

- [ ] **Step 2: Verify the file exists and has no syntax errors**

Run: `npm run build 2>&1 | head -20`
Expected: no errors (this file is not yet imported anywhere, so it won't affect the build)

- [ ] **Step 3: Commit**

```bash
git add src/session/GameSessionContext.jsx
git commit -m "feat: add GameSessionContext and useGameSession hook"
```

---

### Task 2: Create LocalSession provider

**Files:**
- Create: `src/session/LocalSession.jsx`
- Reference (read, don't change yet): `src/App.jsx` lines 6–10 and 66–73 — the `ALL_PLAYER_DEFS` and `Game` component

- [ ] **Step 1: Create the file**

```jsx
import { useReducer } from 'react'
import { createInitialState, gameReducer } from '../game/engine.js'
import { COLOUR_ORDER, COLOURS } from '../data/colours.js'
import { GameSessionContext } from './GameSessionContext.jsx'

const ALL_PLAYER_DEFS = COLOUR_ORDER.map((colour, i) => ({
  id: `p${i + 1}`,
  name: COLOURS[colour].label,
  colour,
}))

export function LocalSession({ playerCount, onNewGame, children }) {
  const [state, dispatch] = useReducer(
    gameReducer,
    { playerDefs: ALL_PLAYER_DEFS.slice(0, playerCount), totalRounds: 12 },
    createInitialState,
  )
  return (
    <GameSessionContext.Provider value={{ state, dispatch, onNewGame }}>
      {children}
    </GameSessionContext.Provider>
  )
}
```

- [ ] **Step 2: Verify no build errors**

Run: `npm run build 2>&1 | head -20`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add src/session/LocalSession.jsx
git commit -m "feat: add LocalSession provider wrapping useReducer"
```

---

### Task 3: Update App.jsx to use LocalSession

**Files:**
- Modify: `src/App.jsx`

Current `Game` component (lines 66–73):
```jsx
function Game({ playerCount, onNewGame }) {
  const [state, dispatch] = useReducer(
    gameReducer,
    { playerDefs: ALL_PLAYER_DEFS.slice(0, playerCount), totalRounds: 12 },
    createInitialState,
  )
  return <GameBoard state={state} dispatch={dispatch} onNewGame={onNewGame} />
}
```

- [ ] **Step 1: Replace `Game` component and remove now-unused imports**

New `src/App.jsx`:
```jsx
import { useState } from 'react'
import { COLOUR_ORDER, COLOURS } from './data/colours.js'
import { LocalSession } from './session/LocalSession.jsx'
import GameBoard from './components/GameBoard.jsx'

function SetupScreen({ onStart }) {
  const [count, setCount] = useState(5)
  const ALL_PLAYER_DEFS = COLOUR_ORDER.map((colour, i) => ({
    id: `p${i + 1}`,
    name: COLOURS[colour].label,
    colour,
  }))

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="bg-gray-800 rounded-2xl p-10 flex flex-col gap-8 w-96 shadow-2xl">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Dependency Game</h1>
          <p className="text-gray-400 text-sm">How many players?</p>
        </div>

        {/* Player count selector */}
        <div className="flex gap-3 justify-center">
          {[4, 5, 6].map(n => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={`w-16 h-16 rounded-xl text-2xl font-bold transition-colors cursor-pointer
                ${count === n
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Colour preview */}
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Players</p>
          <div className="flex flex-col gap-2">
            {ALL_PLAYER_DEFS.map((p, i) => (
              <div
                key={p.colour}
                className={`flex items-center gap-3 transition-opacity ${i < count ? 'opacity-100' : 'opacity-25'}`}
              >
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: COLOURS[p.colour].hex }} />
                <span className="text-sm">{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => onStart(count)}
          className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-3 rounded-xl font-semibold text-lg transition-colors cursor-pointer"
        >
          Start Game
        </button>
      </div>
    </div>
  )
}

function Game({ playerCount, onNewGame }) {
  return (
    <LocalSession playerCount={playerCount} onNewGame={onNewGame}>
      <GameBoard />
    </LocalSession>
  )
}

export default function App() {
  const [playerCount, setPlayerCount] = useState(null)

  if (!playerCount) return <SetupScreen onStart={setPlayerCount} />
  return <Game playerCount={playerCount} onNewGame={() => setPlayerCount(null)} />
}
```

- [ ] **Step 2: Verify build still works (GameBoard still accepts old props at this point — that's fine)**

Run: `npm run build 2>&1 | head -30`
Expected: may warn about unused props in GameBoard, but should not error

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: App uses LocalSession provider instead of inline useReducer"
```

---

### Task 4: Update GameBoard to use useGameSession()

**Files:**
- Modify: `src/components/GameBoard.jsx`

- [ ] **Step 1: Replace prop destructuring with hook call**

At the top of `GameBoard.jsx`, change the export line and add the hook import:

Remove:
```jsx
export default function GameBoard({ state, dispatch, onNewGame }) {
```

Replace with (also add import at top of file):
```jsx
import { useGameSession } from '../session/GameSessionContext.jsx'

// ... (keep all other existing imports)

export default function GameBoard() {
  const { state, dispatch, onNewGame } = useGameSession()
```

All other code in `GameBoard.jsx` remains exactly as-is. The variables `state`, `dispatch`, and `onNewGame` are used identically throughout — only their source changes.

- [ ] **Step 2: Run the existing tests to confirm game logic is unaffected**

Run: `npm test`
Expected: all tests pass (engine and rules tests are unaffected by this change)

- [ ] **Step 3: Run a build check**

Run: `npm run build 2>&1 | head -30`
Expected: clean build with no errors

- [ ] **Step 4: Smoke test in the browser**

Open http://localhost:5173 and verify:
- Setup screen appears, player count selector works
- Starting a game loads the board correctly
- All 4 phases work: Set → Plan → Work → Score
- "New Game" button from the game-over modal returns to setup screen

- [ ] **Step 5: Commit**

```bash
git add src/components/GameBoard.jsx
git commit -m "refactor: GameBoard reads state/dispatch from useGameSession hook"
```

---

## Self-Review

**Spec coverage:**
- ✅ Context + hook created (Task 1)
- ✅ LocalSession provider wraps existing useReducer (Task 2)
- ✅ App.jsx uses LocalSession (Task 3)
- ✅ GameBoard uses hook instead of props (Task 4)
- ✅ UI-only state stays local in GameBoard (no change needed)
- ✅ All game logic untouched

**Placeholder scan:** No TBDs or placeholders — all code is complete.

**Type consistency:** `state`, `dispatch`, `onNewGame` named identically across all four tasks. `ALL_PLAYER_DEFS` moved into `LocalSession.jsx` (single source of truth); duplicated inline in `SetupScreen` for the colour preview (acceptable — it's display-only, not game state).

**Known limitation:** `ALL_PLAYER_DEFS` is now defined in two places (LocalSession and SetupScreen). This is intentional — the preview in SetupScreen is cosmetic, while LocalSession's copy drives actual game init. If this bothers you, extract it to `src/data/colours.js` in a follow-up.

---

## Future Plans

This plan is **Phase 1** of a two-phase architecture:

- **Phase 1 (this plan):** LocalSession refactor — extract state into context
- **Phase 2 (future plan):** NetworkSession + mode selection on SetupScreen
  - Plan file: `docs/superpowers/plans/2026-??-??-network-session.md`
  - SetupScreen gains a "Pass & Play / Network" toggle
  - NetworkSession implements same context interface, state lives on server
  - Recommended tech: PartyKit (simplest) or Supabase Realtime (if persistence needed)
