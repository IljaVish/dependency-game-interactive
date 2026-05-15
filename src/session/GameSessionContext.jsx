import { createContext, useContext } from 'react'

// Context value shape: { state, dispatch, onNewGame, myPlayerIndex, isFacilitator }
// myPlayerIndex: number (0-5) for network players, null for pass-and-play and facilitators
// isFacilitator: true when the viewer is a facilitator (observer-only, no action controls)
export const GameSessionContext = createContext(null)

export function useGameSession() {
  const ctx = useContext(GameSessionContext)
  if (!ctx) throw new Error('useGameSession must be used inside a session provider')
  return ctx
}
