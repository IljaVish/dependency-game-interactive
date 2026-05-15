import { createContext, useContext } from 'react'

export const GameSessionContext = createContext(null)

export function useGameSession() {
  const ctx = useContext(GameSessionContext)
  if (!ctx) throw new Error('useGameSession must be used inside a session provider')
  return ctx
}
