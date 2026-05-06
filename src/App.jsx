import { useReducer, useState } from 'react'
import { createInitialState, gameReducer } from './game/engine.js'
import { COLOUR_ORDER, COLOURS } from './data/colours.js'
import GameBoard from './components/GameBoard.jsx'

const ALL_PLAYER_DEFS = COLOUR_ORDER.map((colour, i) => ({
  id: `p${i + 1}`,
  name: COLOURS[colour].label,
  colour,
}))

function SetupScreen({ onStart }) {
  const [count, setCount] = useState(5)

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

function Game({ playerCount }) {
  const [state, dispatch] = useReducer(
    gameReducer,
    { playerDefs: ALL_PLAYER_DEFS.slice(0, playerCount), totalRounds: 12 },
    createInitialState,
  )
  return <GameBoard state={state} dispatch={dispatch} />
}

export default function App() {
  const [playerCount, setPlayerCount] = useState(null)

  if (!playerCount) return <SetupScreen onStart={setPlayerCount} />
  return <Game playerCount={playerCount} />
}
