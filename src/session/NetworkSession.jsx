import { useState, useEffect, useRef } from 'react'
import PartySocket from 'partysocket'
import { GameSessionContext } from './GameSessionContext.jsx'
import Lobby from '../components/Lobby.jsx'

// crypto.randomUUID is only defined in secure contexts (HTTPS or localhost)
function generateToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
}

export function NetworkSession({ roomCode, playerName, isFacilitator, onNewGame, children }) {
  const [connStatus, setConnStatus] = useState('connecting')
  const [playerIndex, setPlayerIndex] = useState(null)
  const [lobbyPlayers, setLobbyPlayers] = useState([])
  const [gameState, setGameState] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [facilitatorEventLabel, setFacilitatorEventLabel] = useState(null)
  const socketRef = useRef(null)

  // Stable per-tab token so reconnects restore the same player slot
  const [token] = useState(() => {
    const key = `depgame-token-${roomCode}`
    let t = sessionStorage.getItem(key)
    if (!t) { t = generateToken(); sessionStorage.setItem(key, t) }
    return t
  })

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
        token,
      }))
    })

    socket.addEventListener('close', () => setConnStatus('disconnected'))

    socket.addEventListener('message', e => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'joined') setPlayerIndex(msg.playerIndex)
      if (msg.type === 'lobby') setLobbyPlayers(msg.players)
      if (msg.type === 'state') setGameState(msg.state)
      if (msg.type === 'error') setErrorMsg(msg.message)
      if (msg.type === 'facilitator_event') setFacilitatorEventLabel(msg.label)
    })

    return () => socket.close()
  }, [roomCode, playerName, isFacilitator])

  function dispatch(action) {
    socketRef.current?.send(JSON.stringify({ type: 'dispatch', action }))
  }

  function facilitatorDispatch(action) {
    socketRef.current?.send(JSON.stringify({ type: 'facilitator_dispatch', action }))
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

  const errorToast = errorMsg && (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-700 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-4 z-50">
      <span>{errorMsg}</span>
      <button onClick={() => setErrorMsg(null)} className="text-white/80 hover:text-white text-lg leading-none cursor-pointer">×</button>
    </div>
  )

  if (!gameState) {
    return (
      <>
        {errorToast}
        <Lobby
          roomCode={roomCode}
          players={lobbyPlayers}
          isFacilitator={isFacilitator}
          onStart={handleStart}
        />
      </>
    )
  }

  return (
    <>
      {errorToast}
      <GameSessionContext.Provider value={{
        state: gameState,
        dispatch,
        onNewGame,
        myPlayerIndex: isFacilitator ? null : playerIndex,
        isFacilitator,
        facilitatorDispatch: isFacilitator ? facilitatorDispatch : undefined,
        facilitatorEventLabel,
      }}>
        {children}
      </GameSessionContext.Provider>
    </>
  )
}
