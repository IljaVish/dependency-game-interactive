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
