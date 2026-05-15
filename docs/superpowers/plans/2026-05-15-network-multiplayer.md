# Network Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time network multiplayer via PartyKit while keeping Pass & Play as an alternative mode.

**Architecture:** PartyKit server holds game state per room; clients are display+input only. `NetworkSession` implements the same `useGameSession()` interface as `LocalSession` — `GameBoard` and all child components require no changes beyond adding `myPlayerIndex` to the context. In network mode, players act simultaneously; phase transitions are mostly implicit (engine auto-advances Set, server auto-advances Work→Score, engine auto-advances Plan via `PLAYER_DONE_PLANNING`).

**Tech Stack:** PartyKit (Cloudflare Durable Objects + WebSockets), `partysocket` client library, React 18, Vite, Vitest

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/game/engine.js` | Modify | Add `planReadyPlayers`, `PLAYER_DONE_PLANNING` action |
| `src/game/engine.test.js` | Modify | Tests for new engine action |
| `src/session/GameSessionContext.jsx` | Modify | Document `myPlayerIndex` in interface comment |
| `src/session/LocalSession.jsx` | Modify | Pass `myPlayerIndex: null` in context value |
| `src/session/NetworkSession.jsx` | Create | WebSocket provider; same interface as LocalSession |
| `src/components/GameBoard.jsx` | Modify | Network-mode controls (per-player buttons, no roll-all) |
| `src/components/Lobby.jsx` | Create | Waiting room (player list, start gate, room code display) |
| `src/App.jsx` | Modify | SetupScreen tabs (Pass & Play / Network) + network join flow |
| `party/game.js` | Create | PartyKit server (room state, broadcast, auto-advance) |
| `partykit.json` | Create | PartyKit config |
| `package.json` | Modify | Add `partykit` + `partysocket` dependencies |

---

## Task 1: Engine — planReadyPlayers + PLAYER_DONE_PLANNING

**Files:**
- Modify: `src/game/engine.js`
- Modify: `src/game/engine.test.js`

- [ ] **Step 1: Write the failing tests**

Add these tests to `src/game/engine.test.js` after the existing describe blocks:

```js
describe('PLAYER_DONE_PLANNING', () => {
  function makePlanState(playerCount = 2) {
    const players = Array.from({ length: playerCount }, (_, i) =>
      makePlayer(`p${i + 1}`, ['green', 'blue', 'red', 'yellow', 'purple', 'orange'][i])
    )
    return makeState({ phase: 'plan', players, planReadyPlayers: [] })
  }

  it('adds playerId to planReadyPlayers', () => {
    const state = makePlanState(2)
    const next = gameReducer(state, { type: 'PLAYER_DONE_PLANNING', playerId: 'p1' })
    expect(next.planReadyPlayers).toContain('p1')
    expect(next.phase).toBe('plan')
  })

  it('ignores duplicate calls from the same player', () => {
    const state = makePlanState(2)
    const once = gameReducer(state, { type: 'PLAYER_DONE_PLANNING', playerId: 'p1' })
    const twice = gameReducer(once, { type: 'PLAYER_DONE_PLANNING', playerId: 'p1' })
    expect(twice.planReadyPlayers.filter(id => id === 'p1')).toHaveLength(1)
  })

  it('advances to work phase when all players are ready', () => {
    const state = makePlanState(2)
    const after1 = gameReducer(state, { type: 'PLAYER_DONE_PLANNING', playerId: 'p1' })
    const after2 = gameReducer(after1, { type: 'PLAYER_DONE_PLANNING', playerId: 'p2' })
    expect(after2.phase).toBe('work')
    expect(after2.planReadyPlayers).toEqual([])
  })

  it('does nothing outside the plan phase', () => {
    const state = makeState({ phase: 'work', planReadyPlayers: [] })
    const next = gameReducer(state, { type: 'PLAYER_DONE_PLANNING', playerId: 'p1' })
    expect(next.planReadyPlayers).toEqual([])
  })
})

describe('planReadyPlayers resets on new round', () => {
  it('is empty after ADVANCE_TO_NEXT_ROUND', () => {
    const state = makeState({
      phase: 'score',
      round: 1,
      totalRounds: 12,
      planReadyPlayers: ['p1'],
      players: [makePlayer('p1', 'green')],
      roundScores: [{ round: 1, entries: [] }],
    })
    const next = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    expect(next.planReadyPlayers).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/iljav/dependency-game-interactive && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|planReadyPlayers|PLAYER_DONE)"
```

Expected: tests fail with `planReadyPlayers is not defined` or similar.

- [ ] **Step 3: Add planReadyPlayers to createInitialState**

In `src/game/engine.js`, inside `createInitialState`, add `planReadyPlayers: []` to the returned state object:

```js
  return autoDraw({
    phase: 'set',
    round: 1,
    totalRounds,
    gameOver: false,
    teamScore: 0,
    planReadyPlayers: [],   // ← add this line
    players,
    deck,
    marketplace: [],
    roundScores: [],
  })
```

- [ ] **Step 4: Reset planReadyPlayers in setupNextRound**

In `src/game/engine.js`, inside `setupNextRound`, add `planReadyPlayers: []` to the spread:

```js
  return autoDraw({
    ...state,
    phase: 'set',
    round: nextRound,
    gameOver,
    planReadyPlayers: [],   // ← add this line
    players,
  })
```

- [ ] **Step 5: Add the makeState helper update in the test file**

In `src/game/engine.test.js`, update `makeState` to include `planReadyPlayers`:

```js
function makeState(overrides = {}) {
  return {
    phase: 'work',
    round: 1,
    totalRounds: 12,
    gameOver: false,
    teamScore: 0,
    planReadyPlayers: [],
    players: [],
    deck: [],
    marketplace: [],
    roundScores: [],
    ...overrides,
  }
}
```

- [ ] **Step 6: Add PLAYER_DONE_PLANNING case to gameReducer**

In `src/game/engine.js`, inside `gameReducer`, add this case before the `default:` case:

```js
    case 'PLAYER_DONE_PLANNING': {
      // action: { playerId }
      if (state.phase !== 'plan') return state
      if (state.planReadyPlayers.includes(action.playerId)) return state
      const planReadyPlayers = [...state.planReadyPlayers, action.playerId]
      const allReady = state.players.every(p => planReadyPlayers.includes(p.id))
      if (allReady) return { ...state, planReadyPlayers: [], phase: 'work' }
      return { ...state, planReadyPlayers }
    }
```

- [ ] **Step 6b: Add phase guards to ADVANCE_TO_NEXT_ROUND and ADVANCE_TO_SCORE**

In network mode, multiple players could click "Next Round →" simultaneously, causing the round to advance twice. Guard these actions against being applied from the wrong phase.

In `src/game/engine.test.js`, add these tests:

```js
describe('phase guards on advance actions', () => {
  it('ADVANCE_TO_NEXT_ROUND is a no-op outside score phase', () => {
    const state = makeState({ phase: 'plan', round: 3, planReadyPlayers: [] })
    const next = gameReducer(state, { type: 'ADVANCE_TO_NEXT_ROUND' })
    expect(next.round).toBe(3)
    expect(next.phase).toBe('plan')
  })

  it('ADVANCE_TO_SCORE is a no-op outside work phase', () => {
    const state = makeState({ phase: 'score', round: 1, planReadyPlayers: [] })
    const next = gameReducer(state, { type: 'ADVANCE_TO_SCORE' })
    expect(next.phase).toBe('score')
  })
})
```

In `src/game/engine.js`, update the two cases:

```js
    case 'ADVANCE_TO_SCORE': {
      if (state.phase !== 'work') return state
      const scored = scoreRound(state)
      const gameOver = state.round >= state.totalRounds
      return { ...scored, phase: 'score', gameOver }
    }
```

```js
    case 'ADVANCE_TO_NEXT_ROUND':
      if (state.phase !== 'score') return state
      return setupNextRound(state)
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd /Users/iljav/dependency-game-interactive && npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/iljav/dependency-game-interactive && git add src/game/engine.js src/game/engine.test.js && git commit -m "feat: add planReadyPlayers + PLAYER_DONE_PLANNING for simultaneous plan phase"
```

---

## Task 2: Context + LocalSession — add myPlayerIndex

**Files:**
- Modify: `src/session/GameSessionContext.jsx`
- Modify: `src/session/LocalSession.jsx`

- [ ] **Step 1: Document the interface in GameSessionContext**

Replace the contents of `src/session/GameSessionContext.jsx` with:

```js
import { createContext, useContext } from 'react'

// Context value shape: { state, dispatch, onNewGame, myPlayerIndex }
// myPlayerIndex: number (0-5) in network mode, null in pass-and-play
export const GameSessionContext = createContext(null)

export function useGameSession() {
  const ctx = useContext(GameSessionContext)
  if (!ctx) throw new Error('useGameSession must be used inside a session provider')
  return ctx
}
```

- [ ] **Step 2: Pass myPlayerIndex: null from LocalSession**

In `src/session/LocalSession.jsx`, update the Provider value:

```js
    <GameSessionContext.Provider value={{ state, dispatch, onNewGame, myPlayerIndex: null }}>
```

- [ ] **Step 3: Verify the app still works**

```bash
cd /Users/iljav/dependency-game-interactive && npm test
```

Expected: all tests pass (no runtime changes, just interface documentation).

- [ ] **Step 4: Commit**

```bash
cd /Users/iljav/dependency-game-interactive && git add src/session/GameSessionContext.jsx src/session/LocalSession.jsx && git commit -m "feat: add myPlayerIndex to GameSessionContext interface; LocalSession passes null"
```

---

## Task 3: GameBoard — network-mode controls

**Files:**
- Modify: `src/components/GameBoard.jsx`

This task updates GameBoard to behave differently in network mode (`myPlayerIndex !== null`) vs pass-and-play (`myPlayerIndex === null`).

**Changes summary:**
1. Read `myPlayerIndex` from context
2. Initialize `activePlayerId` to `players[myPlayerIndex]?.id` when in network mode
3. Hide player switcher in network mode
4. Replace phase advance buttons with network-mode equivalents
5. Hide "Roll all dice" button in network mode

- [ ] **Step 1: Read myPlayerIndex from context and fix activePlayerId init**

In `src/components/GameBoard.jsx`, update the first lines of the component body:

```js
  const { state, dispatch, onNewGame, myPlayerIndex } = useGameSession()
  const { round, totalRounds, phase, marketplace, players, gameOver } = state
  const isNetworkMode = myPlayerIndex != null
```

Update the `activePlayerId` useState initializer:

```js
  const [activePlayerId, setActivePlayerId] = useState(() =>
    myPlayerIndex != null
      ? players[myPlayerIndex]?.id ?? null
      : players[0]?.id ?? null
  )
```

- [ ] **Step 2: Hide player switcher in network mode**

In GameBoard's JSX, find the player switcher `<div className="flex gap-1.5">` block that renders the player colour buttons. Wrap it so it only renders in pass-and-play mode:

```jsx
          {/* Player switcher — only in pass-and-play */}
          {!isNetworkMode && (
            <div className="flex gap-1.5">
              {players.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePlayerId(p.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                  style={{
                    backgroundColor: activePlayerId === p.id ? COLOURS[p.colour].hex : '#374151',
                    color: activePlayerId === p.id ? '#fff' : COLOURS[p.colour].hex,
                    outline: activePlayerId === p.id ? `2px solid ${COLOURS[p.colour].hex}` : 'none',
                    outlineOffset: '2px',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
```

- [ ] **Step 3: Update planToWorkWarnings to be network-aware**

Find the `planToWorkWarnings` derived value and update it:

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

- [ ] **Step 4: Add handleNetworkDonePlanning handler**

Add this function after `handleAdvancePhase`:

```js
  function handleNetworkDonePlanning() {
    if (planToWorkWarnings.length > 0 && !advancePending) {
      setAdvancePending(true)
      return
    }
    dispatch({ type: 'PLAYER_DONE_PLANNING', playerId: players[myPlayerIndex].id })
    setAdvancePending(false)
  }
```

- [ ] **Step 5: Update the header — Roll all dice button**

Wrap the "Roll all dice" button and its pending state so they only appear in pass-and-play:

```jsx
          {phase === 'work' && !isNetworkMode && !rollAllPending && (
            <button
              onClick={() => {
                if (rollAllWarnings.length > 0) { setRollAllPending(true) }
                else { dispatch({ type: 'ROLL_ALL_DICE' }) }
              }}
              disabled={!players.some(p => p.dice.some(d => d.value === null))}
              className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer"
            >
              Roll all dice
            </button>
          )}
          {phase === 'work' && !isNetworkMode && rollAllPending && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-yellow-300">{rollAllWarnings.join(' ')}</span>
              <button
                onClick={() => { dispatch({ type: 'ROLL_ALL_DICE' }); setRollAllPending(false) }}
                className="bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded-lg font-semibold text-sm cursor-pointer"
              >
                Roll anyway
              </button>
              <button onClick={() => setRollAllPending(false)}
                className="text-sm text-gray-400 hover:text-white cursor-pointer">Cancel</button>
            </div>
          )}
```

- [ ] **Step 6: Update the header — phase advance button (split pass-and-play vs network)**

Replace the existing `{!gameOver && (advancePending ? ... : <button>)}` block with:

```jsx
          {/* Pass-and-play: advance button for all phases */}
          {!isNetworkMode && !gameOver && (
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

          {/* Network mode: per-phase controls */}
          {isNetworkMode && !gameOver && (
            <>
              {phase === 'plan' && (
                advancePending
                  ? <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-yellow-300">{planToWorkWarnings.join(' ')}</span>
                      <button onClick={handleNetworkDonePlanning}
                        className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer">
                        Done anyway
                      </button>
                      <button onClick={() => setAdvancePending(false)}
                        className="text-sm text-gray-400 hover:text-white cursor-pointer">Cancel</button>
                    </div>
                  : <button
                      onClick={handleNetworkDonePlanning}
                      className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
                    >
                      Done planning
                    </button>
              )}
              {phase === 'score' && (
                <button
                  onClick={() => { dispatch({ type: 'ADVANCE_TO_NEXT_ROUND' }); setWorkModes({}) }}
                  className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
                >
                  Next Round →
                </button>
              )}
              {/* Set phase: auto-advances when all pending cards decided */}
              {/* Work phase: server auto-advances after all players roll */}
            </>
          )}
```

- [ ] **Step 7: Run tests and start dev server to verify**

```bash
cd /Users/iljav/dependency-game-interactive && npm test
```

Then start the dev server and verify pass-and-play still works as before:

```bash
npm run dev
```

Open `http://localhost:5173`, start a pass-and-play game, confirm all phases work normally.

- [ ] **Step 8: Commit**

```bash
cd /Users/iljav/dependency-game-interactive && git add src/components/GameBoard.jsx && git commit -m "feat: GameBoard network-mode controls (per-player done-planning, no roll-all)"
```

---

## Task 4: PartyKit setup

**Files:**
- Modify: `package.json`
- Create: `partykit.json`

- [ ] **Step 1: Install PartyKit dependencies**

```bash
cd /Users/iljav/dependency-game-interactive && npm install partykit@latest partysocket@latest
```

- [ ] **Step 2: Add dev scripts to package.json**

In `package.json`, add to the `scripts` section:

```json
    "party:dev": "partykit dev",
    "party:deploy": "partykit deploy"
```

- [ ] **Step 3: Create partykit.json**

Create `partykit.json` at the project root:

```json
{
  "name": "dependency-game",
  "main": "party/game.js",
  "compatibilityDate": "2024-01-01"
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/iljav/dependency-game-interactive && git add package.json package-lock.json partykit.json && git commit -m "feat: add partykit + partysocket dependencies and config"
```

---

## Task 5: PartyKit server — party/game.js

**Files:**
- Create: `party/game.js`

- [ ] **Step 1: Create the party directory and server file**

Create `party/game.js`:

```js
import { gameReducer, createInitialState } from '../src/game/engine.js'
import { COLOUR_ORDER } from '../src/data/colours.js'

export default class GameServer {
  constructor(party) {
    this.party = party
    // lobby: [{ connId, name, colour, role }]
    // role is 'player' or 'facilitator'
    this.lobby = []
    this.gameState = null
  }

  onConnect(conn) {
    if (this.gameState) {
      conn.send(JSON.stringify({ type: 'state', state: this.gameState }))
    } else {
      conn.send(JSON.stringify({ type: 'lobby', players: this.lobby }))
    }
  }

  onMessage(message, sender) {
    const msg = JSON.parse(message)

    switch (msg.type) {
      case 'join': {
        const { name, role } = msg

        // Reconnect: player rejoins with same name
        const existing = this.lobby.find(p => p.name === name && p.role === role)
        if (existing) {
          existing.connId = sender.id
          const playerIndex = this.lobby.filter(p => p.role === 'player').indexOf(existing)
          sender.send(JSON.stringify({
            type: 'joined',
            playerIndex: role === 'facilitator' ? -1 : playerIndex,
            roomCode: this.party.id,
          }))
          if (this.gameState) {
            sender.send(JSON.stringify({ type: 'state', state: this.gameState }))
          } else {
            this.party.broadcast(JSON.stringify({ type: 'lobby', players: this.lobby }))
          }
          return
        }

        if (role === 'facilitator') {
          this.lobby.push({ connId: sender.id, name, role: 'facilitator' })
          sender.send(JSON.stringify({ type: 'joined', playerIndex: -1, roomCode: this.party.id }))
        } else {
          const playerCount = this.lobby.filter(p => p.role === 'player').length
          if (playerCount >= 6) {
            sender.send(JSON.stringify({ type: 'error', message: 'Room is full (6 players max)' }))
            return
          }
          const colour = COLOUR_ORDER[playerCount]
          this.lobby.push({ connId: sender.id, name, colour, role: 'player' })
          sender.send(JSON.stringify({
            type: 'joined',
            playerIndex: playerCount,
            roomCode: this.party.id,
          }))
        }

        this.party.broadcast(JSON.stringify({ type: 'lobby', players: this.lobby }))
        break
      }

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
        this.gameState = createInitialState({ playerDefs, totalRounds: 12 })
        this.party.broadcast(JSON.stringify({ type: 'state', state: this.gameState }))
        break
      }

      case 'dispatch': {
        if (!this.gameState) return
        const senderEntry = this.lobby.find(p => p.connId === sender.id)
        if (!senderEntry || senderEntry.role !== 'player') return

        this.gameState = gameReducer(this.gameState, msg.action)

        // Auto-advance Work → Score once every player has rolled all their dice
        if (this.gameState.phase === 'work') {
          const allRolled = this.gameState.players.every(
            p => p.dice.every(d => d.value !== null || d.locked)
          )
          if (allRolled) {
            this.gameState = gameReducer(this.gameState, { type: 'ADVANCE_TO_SCORE' })
          }
        }

        this.party.broadcast(JSON.stringify({ type: 'state', state: this.gameState }))
        break
      }
    }
  }

  onClose(conn) {
    // Keep the lobby entry so the player can reconnect with the same name.
    // Broadcast updated lobby to inform others.
    this.party.broadcast(JSON.stringify({ type: 'lobby', players: this.lobby }))
  }
}
```

- [ ] **Step 2: Start the PartyKit dev server and verify no import errors**

In a separate terminal:

```bash
cd /Users/iljav/dependency-game-interactive && npx partykit dev
```

Expected: server starts on `http://localhost:1999` with no import errors. You should see something like `[partykit] party server started`.

If you see import errors for `engine.js` or `colours.js`, check that the relative paths from `party/game.js` to `src/game/engine.js` are correct (`../src/game/engine.js`).

- [ ] **Step 3: Commit**

```bash
cd /Users/iljav/dependency-game-interactive && git add party/game.js && git commit -m "feat: add PartyKit server — room state, broadcast, auto Work→Score advance"
```

---

## Task 6: NetworkSession component

**Files:**
- Create: `src/session/NetworkSession.jsx`

- [ ] **Step 1: Create NetworkSession**

Create `src/session/NetworkSession.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react'
import PartySocket from 'partysocket'
import { GameSessionContext } from './GameSessionContext.jsx'

export function NetworkSession({ roomCode, playerName, isFacilitator, onNewGame, children }) {
  const [connStatus, setConnStatus] = useState('connecting')
  const [playerIndex, setPlayerIndex] = useState(null)
  const [lobbyPlayers, setLobbyPlayers] = useState([])
  const [gameState, setGameState] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    const host = import.meta.env.VITE_PARTYKIT_HOST ?? 'localhost:1999'
    const socket = new PartySocket({ host, room: roomCode })
    socketRef.current = socket

    socket.addEventListener('open', () => {
      setConnStatus('connected')
      socket.send(JSON.stringify({
        type: 'join',
        name: playerName,
        role: isFacilitator ? 'facilitator' : 'player',
      }))
    })

    socket.addEventListener('close', () => setConnStatus('disconnected'))

    socket.addEventListener('message', e => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'joined') setPlayerIndex(msg.playerIndex)
      if (msg.type === 'lobby') setLobbyPlayers(msg.players)
      if (msg.type === 'state') setGameState(msg.state)
    })

    return () => socket.close()
  }, [roomCode, playerName, isFacilitator])

  function dispatch(action) {
    if (isFacilitator) return
    socketRef.current?.send(JSON.stringify({ type: 'dispatch', action }))
  }

  function handleStart() {
    socketRef.current?.send(JSON.stringify({ type: 'start' }))
  }

  if (connStatus === 'connecting') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Connecting to room {roomCode}…</p>
      </div>
    )
  }

  if (connStatus === 'disconnected') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-yellow-400">Connection lost — reconnecting…</p>
      </div>
    )
  }

  if (!gameState) {
    // Still in lobby — import lazily to avoid circular dep
    const { Lobby } = require('./LobbyForward.js') // see note below
    return (
      <Lobby
        roomCode={roomCode}
        players={lobbyPlayers}
        isFacilitator={isFacilitator}
        onStart={handleStart}
      />
    )
  }

  return (
    <GameSessionContext.Provider value={{
      state: gameState,
      dispatch,
      onNewGame,
      myPlayerIndex: isFacilitator ? null : playerIndex,
    }}>
      {children}
    </GameSessionContext.Provider>
  )
}
```

**Note:** The `require('./LobbyForward.js')` above is a placeholder — in Step 2 we'll do a proper static import of Lobby. There's no circular dependency concern; update the import directly:

- [ ] **Step 2: Fix the Lobby import in NetworkSession**

Replace the `require` with a proper static import at the top of the file. Add this import:

```js
import Lobby from '../components/Lobby.jsx'
```

And in the JSX where Lobby is rendered, replace the `require`/`Lobby` extraction with just `<Lobby ... />`:

```jsx
  if (!gameState) {
    return (
      <Lobby
        roomCode={roomCode}
        players={lobbyPlayers}
        isFacilitator={isFacilitator}
        onStart={handleStart}
      />
    )
  }
```

The final `src/session/NetworkSession.jsx` should look like:

```jsx
import { useState, useEffect, useRef } from 'react'
import PartySocket from 'partysocket'
import { GameSessionContext } from './GameSessionContext.jsx'
import Lobby from '../components/Lobby.jsx'

export function NetworkSession({ roomCode, playerName, isFacilitator, onNewGame, children }) {
  const [connStatus, setConnStatus] = useState('connecting')
  const [playerIndex, setPlayerIndex] = useState(null)
  const [lobbyPlayers, setLobbyPlayers] = useState([])
  const [gameState, setGameState] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    const host = import.meta.env.VITE_PARTYKIT_HOST ?? 'localhost:1999'
    const socket = new PartySocket({ host, room: roomCode })
    socketRef.current = socket

    socket.addEventListener('open', () => {
      setConnStatus('connected')
      socket.send(JSON.stringify({
        type: 'join',
        name: playerName,
        role: isFacilitator ? 'facilitator' : 'player',
      }))
    })

    socket.addEventListener('close', () => setConnStatus('disconnected'))

    socket.addEventListener('message', e => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'joined') setPlayerIndex(msg.playerIndex)
      if (msg.type === 'lobby') setLobbyPlayers(msg.players)
      if (msg.type === 'state') setGameState(msg.state)
    })

    return () => socket.close()
  }, [roomCode, playerName, isFacilitator])

  function dispatch(action) {
    if (isFacilitator) return
    socketRef.current?.send(JSON.stringify({ type: 'dispatch', action }))
  }

  function handleStart() {
    socketRef.current?.send(JSON.stringify({ type: 'start' }))
  }

  if (connStatus === 'connecting') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Connecting to room {roomCode}…</p>
      </div>
    )
  }

  if (connStatus === 'disconnected') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-yellow-400">Connection lost — reconnecting…</p>
      </div>
    )
  }

  if (!gameState) {
    return (
      <Lobby
        roomCode={roomCode}
        players={lobbyPlayers}
        isFacilitator={isFacilitator}
        onStart={handleStart}
      />
    )
  }

  return (
    <GameSessionContext.Provider value={{
      state: gameState,
      dispatch,
      onNewGame,
      myPlayerIndex: isFacilitator ? null : playerIndex,
    }}>
      {children}
    </GameSessionContext.Provider>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/iljav/dependency-game-interactive && git add src/session/NetworkSession.jsx && git commit -m "feat: add NetworkSession WebSocket provider"
```

---

## Task 7: Lobby component

**Files:**
- Create: `src/components/Lobby.jsx`

- [ ] **Step 1: Create Lobby**

Create `src/components/Lobby.jsx`:

```jsx
import { COLOURS } from '../data/colours.js'

const MAX_PLAYERS = 6

export default function Lobby({ roomCode, players, isFacilitator, onStart }) {
  const playerSlots = players.filter(p => p.role === 'player')
  const facilitators = players.filter(p => p.role === 'facilitator')
  const playerCount = playerSlots.length
  const canStart = playerCount >= 4

  const seatsOpen = MAX_PLAYERS - playerCount
  let startLabel = 'Start Game'
  if (!canStart) startLabel = `Need at least 4 players (${playerCount} joined)`
  else if (seatsOpen > 0) startLabel = `Start with ${playerCount} players (${seatsOpen} seat${seatsOpen > 1 ? 's' : ''} open)`

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl p-10 flex flex-col gap-8 w-full max-w-md shadow-2xl">

        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Room code</p>
          <h1 className="text-5xl font-bold tracking-widest text-white">{roomCode}</h1>
          <p className="text-sm text-gray-400">Share this code with your players</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Players ({playerCount}/{MAX_PLAYERS})</p>
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const player = playerSlots[i]
            return (
              <div
                key={i}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg ${player ? 'bg-gray-700' : 'bg-gray-700/40 border border-dashed border-gray-600'}`}
              >
                {player ? (
                  <>
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLOURS[player.colour]?.hex ?? '#9ca3af' }}
                    />
                    <span className="text-sm font-medium">{player.name}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-500 italic">Empty seat</span>
                )}
              </div>
            )
          })}
        </div>

        {facilitators.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Facilitators</p>
            {facilitators.map((f, i) => (
              <span key={i} className="text-sm text-gray-300">{f.name}</span>
            ))}
          </div>
        )}

        {isFacilitator ? (
          <button
            onClick={onStart}
            disabled={!canStart}
            className={`py-3 rounded-xl font-semibold text-base transition-colors cursor-pointer
              ${canStart
                ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
          >
            {startLabel}
          </button>
        ) : (
          <p className="text-center text-sm text-gray-400">Waiting for facilitator to start…</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/iljav/dependency-game-interactive && git add src/components/Lobby.jsx && git commit -m "feat: add Lobby component (player slots, start gate, room code display)"
```

---

## Task 8: App.jsx — SetupScreen tabs + network join flow

**Files:**
- Modify: `src/App.jsx`

The SetupScreen gains two tabs: Pass & Play (existing flow) and Network (create/join room). Once the user completes the network join form, `App` mounts `<NetworkSession>` with `<GameBoard />` inside.

- [ ] **Step 1: Replace App.jsx**

Replace the entire contents of `src/App.jsx` with:

```jsx
import { useState } from 'react'
import { COLOUR_ORDER, COLOURS } from './data/colours.js'
import { LocalSession } from './session/LocalSession.jsx'
import { NetworkSession } from './session/NetworkSession.jsx'
import GameBoard from './components/GameBoard.jsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ─── SetupScreen ──────────────────────────────────────────────────────────────

function SetupScreen({ onStartLocal, onStartNetwork }) {
  const [tab, setTab] = useState('local')
  const [count, setCount] = useState(5)

  // Network join form state
  const [networkView, setNetworkView] = useState('choose') // 'choose' | 'create' | 'join' | 'joinFacilitator'
  const [playerName, setPlayerName] = useState('')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [facilitatorName, setFacilitatorName] = useState('')

  const ALL_PLAYER_DEFS = COLOUR_ORDER.map((colour, i) => ({
    id: `p${i + 1}`,
    name: COLOURS[colour].label,
    colour,
  }))

  function handleCreateRoom() {
    if (!facilitatorName.trim()) return
    const code = generateRoomCode()
    onStartNetwork({ roomCode: code, playerName: facilitatorName.trim(), isFacilitator: true })
  }

  function handleJoinRoom() {
    if (!playerName.trim() || !roomCodeInput.trim()) return
    onStartNetwork({
      roomCode: roomCodeInput.trim().toUpperCase(),
      playerName: playerName.trim(),
      isFacilitator: false,
    })
  }

  function handleJoinAsFacilitator() {
    if (!facilitatorName.trim() || !roomCodeInput.trim()) return
    onStartNetwork({
      roomCode: roomCodeInput.trim().toUpperCase(),
      playerName: facilitatorName.trim(),
      isFacilitator: true,
    })
  }

  const tabClass = active =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
      active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
    }`

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="bg-gray-800 rounded-2xl p-10 flex flex-col gap-8 w-96 shadow-2xl">
        <h1 className="text-2xl font-bold">Dependency Game</h1>

        {/* Mode tabs */}
        <div className="flex gap-2 bg-gray-700 p-1 rounded-xl">
          <button className={tabClass(tab === 'local')} onClick={() => setTab('local')}>
            Pass & Play
          </button>
          <button className={tabClass(tab === 'network')} onClick={() => setTab('network')}>
            Network
          </button>
        </div>

        {/* Pass & Play tab */}
        {tab === 'local' && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-gray-400 text-sm">How many players?</p>
            </div>
            <div className="flex gap-3 justify-center">
              {[4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`w-16 h-16 rounded-xl text-2xl font-bold transition-colors cursor-pointer
                    ${count === n ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                  {n}
                </button>
              ))}
            </div>
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
              onClick={() => onStartLocal(count)}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-3 rounded-xl font-semibold text-lg transition-colors cursor-pointer"
            >
              Start Game
            </button>
          </>
        )}

        {/* Network tab */}
        {tab === 'network' && (
          <>
            {networkView === 'choose' && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setNetworkView('create')}
                  className="bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-semibold cursor-pointer"
                >
                  Create a Room
                </button>
                <button
                  onClick={() => setNetworkView('join')}
                  className="bg-gray-700 hover:bg-gray-600 py-3 rounded-xl font-semibold cursor-pointer"
                >
                  Join a Room
                </button>
                <button
                  onClick={() => setNetworkView('joinFacilitator')}
                  className="bg-gray-700 hover:bg-gray-600 py-3 rounded-xl font-semibold cursor-pointer"
                >
                  Join as Facilitator
                </button>
              </div>
            )}

            {networkView === 'create' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-gray-400">You'll be the facilitator. Share the room code with players.</p>
                <input
                  type="text"
                  placeholder="Your name"
                  value={facilitatorName}
                  onChange={e => setFacilitatorName(e.target.value)}
                  className="bg-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button onClick={() => setNetworkView('choose')}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-xl font-semibold cursor-pointer">
                    Back
                  </button>
                  <button
                    onClick={handleCreateRoom}
                    disabled={!facilitatorName.trim()}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-3 rounded-xl font-semibold cursor-pointer"
                  >
                    Create Room
                  </button>
                </div>
              </div>
            )}

            {networkView === 'join' && (
              <div className="flex flex-col gap-4">
                <input
                  type="text"
                  placeholder="Your name"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  className="bg-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Room code (e.g. TIGER7)"
                  value={roomCodeInput}
                  onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="bg-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button onClick={() => setNetworkView('choose')}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-xl font-semibold cursor-pointer">
                    Back
                  </button>
                  <button
                    onClick={handleJoinRoom}
                    disabled={!playerName.trim() || roomCodeInput.length < 6}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-3 rounded-xl font-semibold cursor-pointer"
                  >
                    Join
                  </button>
                </div>
              </div>
            )}

            {networkView === 'joinFacilitator' && (
              <div className="flex flex-col gap-4">
                <input
                  type="text"
                  placeholder="Your name"
                  value={facilitatorName}
                  onChange={e => setFacilitatorName(e.target.value)}
                  className="bg-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Room code (e.g. TIGER7)"
                  value={roomCodeInput}
                  onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="bg-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button onClick={() => setNetworkView('choose')}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-xl font-semibold cursor-pointer">
                    Back
                  </button>
                  <button
                    onClick={handleJoinAsFacilitator}
                    disabled={!facilitatorName.trim() || roomCodeInput.length < 6}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-3 rounded-xl font-semibold cursor-pointer"
                  >
                    Join as Facilitator
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState(null)
  // session: null | { type: 'local', playerCount }
  //                | { type: 'network', roomCode, playerName, isFacilitator }

  if (!session) {
    return (
      <SetupScreen
        onStartLocal={playerCount => setSession({ type: 'local', playerCount })}
        onStartNetwork={config => setSession({ type: 'network', ...config })}
      />
    )
  }

  if (session.type === 'local') {
    return (
      <LocalSession playerCount={session.playerCount} onNewGame={() => setSession(null)}>
        <GameBoard />
      </LocalSession>
    )
  }

  return (
    <NetworkSession
      roomCode={session.roomCode}
      playerName={session.playerName}
      isFacilitator={session.isFacilitator}
      onNewGame={() => setSession(null)}
    >
      <GameBoard />
    </NetworkSession>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/iljav/dependency-game-interactive && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Verify pass-and-play still works**

Start the dev server:
```bash
npm run dev
```

Open `http://localhost:5173`. Verify:
- Pass & Play tab shows the player count picker and works as before
- Network tab shows the Create / Join / Join as Facilitator buttons

- [ ] **Step 4: Commit**

```bash
cd /Users/iljav/dependency-game-interactive && git add src/App.jsx && git commit -m "feat: SetupScreen Pass & Play / Network tabs with room create/join flow"
```

---

## Task 9: End-to-end smoke test with local PartyKit

This task verifies the full network flow locally before deploying.

- [ ] **Step 1: Start both dev servers**

Terminal 1:
```bash
cd /Users/iljav/dependency-game-interactive && npm run party:dev
```
Expected: `[partykit] party server started on localhost:1999`

Terminal 2:
```bash
cd /Users/iljav/dependency-game-interactive && npm run dev
```
Expected: Vite dev server at `http://localhost:5173`

- [ ] **Step 2: Create a room and join as players**

Open four browser tabs at `http://localhost:5173`.

Tab 1 (Facilitator):
1. Network tab → Create a Room → enter name "Facilitator" → Create Room
2. Note the room code shown in the Lobby screen

Tab 2–4 (Players):
1. Network tab → Join a Room → enter a name + the room code → Join
2. Each player should appear in the Lobby screen on all tabs

- [ ] **Step 3: Verify lobby behaviour**

- Lobby shows all joined players with their colour dots
- Player count < 4: Start Game button disabled
- Player count = 4: Start Game enabled with "2 seats still open" note
- Player count = 6: Start Game enabled, no warning

- [ ] **Step 4: Start the game and play through all phases**

Facilitator clicks "Start Game". Verify on all tabs:
- All tabs transition from Lobby to GameBoard
- Each player tab shows only their own controls (no player switcher)
- Set phase: each player decides their pending card → all tabs auto-advance to Plan
- Plan phase: each player allocates dice → clicks "Done planning" → all auto-advance to Work
- Work phase: each player rolls → all tabs auto-advance to Score
- Score phase: any player clicks "Next Round →" → all advance

- [ ] **Step 5: Deploy to PartyKit (requires PartyKit account)**

```bash
cd /Users/iljav/dependency-game-interactive && npx partykit login
npx partykit deploy
```

Note the deployed URL (e.g. `dependency-game.yourusername.partykit.dev`).

- [ ] **Step 6: Set VITE_PARTYKIT_HOST for production builds**

Create `.env.production` at the project root (do not commit this — add to `.gitignore`):

```
VITE_PARTYKIT_HOST=dependency-game.yourusername.partykit.dev
```

Add `.env.production` to `.gitignore`:

```bash
echo '.env.production' >> /Users/iljav/dependency-game-interactive/.gitignore
git add .gitignore && git commit -m "chore: ignore .env.production (contains PartyKit host)"
```

- [ ] **Step 7: Final commit**

```bash
cd /Users/iljav/dependency-game-interactive && git add -A && git status
# Review staged files, then:
git commit -m "feat: network multiplayer — full PartyKit integration"
```
