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
