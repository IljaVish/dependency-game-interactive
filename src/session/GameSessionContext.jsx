import { createContext, useContext } from 'react'

// Context value shape: { state, dispatch, onNewGame, myPlayerIndex }
// myPlayerIndex: number (0-5) in network mode, null in pass-and-play
export const GameSessionContext = createContext(null)

export function useGameSession() {
  const ctx = useContext(GameSessionContext)
  if (!ctx) throw new Error('useGameSession must be used inside a session provider')
  return ctx
}
