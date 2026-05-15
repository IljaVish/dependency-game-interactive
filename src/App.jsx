import { useState, useEffect } from 'react'
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

const SESSION_KEY = 'depgame-network-session'

export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  // session: null | { type: 'local', playerCount }
  //                | { type: 'network', roomCode, playerName, isFacilitator }

  useEffect(() => {
    if (session?.type === 'network') {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      sessionStorage.removeItem(SESSION_KEY)
    }
  }, [session])

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
