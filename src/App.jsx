import { useReducer } from 'react'
import { createInitialState, gameReducer } from './game/engine.js'
import GameBoard from './components/GameBoard.jsx'

const PLAYER_DEFS = [
  { id: 'p1', name: 'Green',  colour: 'green'  },
  { id: 'p2', name: 'Blue',   colour: 'blue'   },
  { id: 'p3', name: 'Yellow', colour: 'yellow' },
]

export default function App() {
  const [state, dispatch] = useReducer(
    gameReducer,
    { playerDefs: PLAYER_DEFS, totalRounds: 12 },
    createInitialState,
  )

  return <GameBoard state={state} dispatch={dispatch} />
}
