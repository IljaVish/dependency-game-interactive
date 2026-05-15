# Network Session Design

**Date:** 2026-05-15  
**Status:** Approved

## Overview

Add real-time network multiplayer to the Dependency Game while keeping Pass & Play as an alternative mode. Each player uses their own device. A facilitator can join any room as a read-only observer. Multiple rooms can run in parallel, supporting workshop setups with several simultaneous game tables.

## Technology

**PartyKit** (Cloudflare Durable Objects + WebSockets). One Durable Object instance per room, isolated and independently scaled. State lives in server memory — no database. Free tier (1M requests/month, no credit card) is sufficient for workshop use.

## Architecture

State authority lives on the server. Clients are display and input only.

```
Player device          PartyKit server (room "TIGER7")      Other devices
─────────────          ────────────────────────────────     ─────────────
dispatch(action)  →    gameReducer(state, action) → state
                  ←    broadcast(state)                 →   re-render
```

`engine.js` is imported by both client (`NetworkSession`) and server (`party/game.js`). No logic is duplicated.

The existing `GameSessionContext` / `useGameSession()` interface is unchanged. `GameBoard` and all child components require zero modifications. `App` renders either `<LocalSession>` or `<NetworkSession>` depending on the mode selected at setup — both provide `{ state, dispatch, onNewGame }` via context.

## Message Protocol

**Client → Server:**

| Message | When |
|---|---|
| `{ type: "join", name, role }` | On connect. `role` is `"player"` or `"facilitator"` |
| `{ type: "dispatch", action }` | Any game action (players only) |
| `{ type: "start" }` | Facilitator starts the game |

**Server → Client:**

| Message | When |
|---|---|
| `{ type: "joined", playerIndex, roomCode }` | Confirms join; tells client their player slot |
| `{ type: "lobby", players }` | Broadcasts current player list while waiting to start |
| `{ type: "state", state }` | Sent to all clients after every action |
| `{ type: "error", message }` | e.g. room full, action rejected |

## Server (`party/game.js`)

```
GameParty
  ├── lobby: [{ connId, name, colour, role }]
  ├── gameState: GameState | null
  ├── onConnect  → send current lobby or state snapshot to new connection
  ├── onMessage("join")     → assign slot, broadcast lobby
  ├── onMessage("start")    → createInitialState(joined players), broadcast state
  ├── onMessage("dispatch") → gameReducer(state, action), broadcast state
  └── onClose    → mark player disconnected, broadcast updated lobby/state
```

Facilitator connections receive all broadcasts but `dispatch` messages from them are ignored.

## NetworkSession (`src/session/NetworkSession.jsx`)

Implements the same interface as `LocalSession`:

```
NetworkSession({ roomCode, playerIndex, onNewGame, children })
  ├── opens WebSocket to PartyKit room
  ├── on "state" message → setLocalState(state)
  ├── dispatch(action)   → send { type: "dispatch", action } over WebSocket
  └── provides { state, dispatch, onNewGame } via GameSessionContext.Provider
```

Facilitator variant: same component, `dispatch` is a no-op, action controls in the UI are hidden.

**Connection states the UI handles:**
- `connecting` — spinner
- `connected, in lobby` — Lobby component
- `connected, in game` — `<GameBoard />`
- `disconnected` — "Reconnecting…" overlay with auto-retry

**Reconnect:** On reconnect, client sends `join` again with the same name. Server matches by name to the existing slot and resends current state. No tokens needed for single-session games.

## Setup Screen & Room Flow

The existing `SetupScreen` gains two tabs: **Pass & Play** and **Network**.

**Pass & Play tab** — unchanged. Pick 4/5/6 players, click Start.

**Network tab — Create a room (facilitator/host):**
1. Click "Create Room" — client generates a random 6-character alphanumeric code (e.g. `TIGER7`) and opens that PartyKit room
2. Share the code with players
3. Lobby screen shows live player list, 6 slots total
4. Click "Start Game" once ready (see start gate below)

**Network tab — Join a room (player):**
1. Enter room code, enter name, click "Join"
2. Lobby screen: "Waiting for game to start…" with live player list

**Network tab — Join as facilitator:**
1. Enter room code, click "Join as Facilitator"
2. No player slot assigned; observer only; sees lobby and game state; no action controls

## Lobby & Start Gate

Rooms always have 6 slots. The player count is not specified at room creation.

- **< 4 players joined:** "Start Game" disabled. Label: *"Need at least 4 players to start"*
- **4 or 5 players joined:** "Start Game" enabled. Soft warning: *"X seats still open — start now or wait?"*
- **6 players joined:** "Start Game" enabled, no warning

Any facilitator connected to the room sees the Start Game button. Players see *"Waiting for facilitator to start…"*

`createInitialState` is called with however many players are present when Start is clicked.

## Files

**New:**
- `party/game.js` — PartyKit server
- `src/session/NetworkSession.jsx` — WebSocket provider
- `src/components/Lobby.jsx` — waiting screen (player list, seat slots, start button)
- `partykit.json` — PartyKit config

**Modified:**
- `src/App.jsx` — SetupScreen gains Pass & Play / Network tabs; Network flow renders NetworkSession
- `package.json` — add `partykit` dependency

**Unchanged:**
- `src/session/LocalSession.jsx`
- `src/session/GameSessionContext.jsx`
- `src/components/GameBoard.jsx` and all children
- `src/game/engine.js`

## Action Model: Simultaneous (Network) vs Sequential (Pass & Play)

**Network mode is simultaneous.** All players act at the same time on their own devices, matching the physical game. Sequential turn-by-turn is a pass-and-play workaround only.

**Implications for implementation:**

1. **`myPlayerIndex` added to context.** `GameSessionContext` gains a `myPlayerIndex` field (number for network, `null` for pass-and-play). `GameBoard` uses it to show each player only their own controls. Pass-and-play continues to use its own active-player switcher logic.

2. **Phase advancement is mostly implicit.** Each phase completes per-player via a natural last action — no extra "I'm done" button except in Plan:

   | Phase | Done signal |
   |---|---|
   | Set | Last pending card decided (keep or marketplace) — implicit |
   | Plan | Explicit "Done planning" button — needed because leaving dice unallocated is a valid choice |
   | Work | Roll action — implicit |
   | Score | Fully automatic; no player input required |

   The engine tracks which players are done per phase. Once all connected players are done, the phase advances.

3. **Engine changes are likely minimal.** The reducer already tracks per-player state. The main addition is a `readyPlayers: Set<playerIndex>` field per phase and a rule that phase transition fires when all connected players are in `readyPlayers`. The implementation plan will detail the exact engine changes needed.

## Out of Scope (future)

- Facilitator pause / broadcast message
- Facilitator multi-table overview (one facilitator, multiple rooms)
- Facilitator takeover of a disconnected player's slot
- Session persistence across server restarts
