import { COLOURS } from '../data/colours.js'

const MAX_PLAYERS = 6

export default function Lobby({ roomCode, players, isFacilitator, onStart }) {
  const playerSlots = players.filter(p => p.role === 'player')
  const facilitators = players.filter(p => p.role === 'facilitator')
  const playerCount = playerSlots.length
  const canStart = playerCount >= 4

  const seatsOpen = MAX_PLAYERS - playerCount
  let startLabel = 'Start Game'
  if (!canStart) startLabel = `Need at least 4 players (${playerCount} joined)`
  else if (seatsOpen > 0) startLabel = `Start with ${playerCount} players (${seatsOpen} seat${seatsOpen > 1 ? 's' : ''} open)`

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl p-10 flex flex-col gap-8 w-full max-w-md shadow-2xl">

        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Room code</p>
          <h1 className="text-5xl font-bold tracking-widest text-white">{roomCode}</h1>
          <p className="text-sm text-gray-400">Share this code with your players</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Players ({playerCount}/{MAX_PLAYERS})</p>
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const player = playerSlots[i]
            return (
              <div
                key={i}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg ${player ? 'bg-gray-700' : 'bg-gray-700/40 border border-dashed border-gray-600'}`}
              >
                {player ? (
                  <>
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLOURS[player.colour]?.hex ?? '#9ca3af' }}
                    />
                    <span className="text-sm font-medium">{player.name}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-500 italic">Empty seat</span>
                )}
              </div>
            )
          })}
        </div>

        {facilitators.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Facilitators</p>
            {facilitators.map((f, i) => (
              <span key={i} className="text-sm text-gray-300">{f.name}</span>
            ))}
          </div>
        )}

        {isFacilitator ? (
          <button
            onClick={onStart}
            disabled={!canStart}
            className={`py-3 rounded-xl font-semibold text-base transition-colors cursor-pointer
              ${canStart
                ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
          >
            {startLabel}
          </button>
        ) : (
          <p className="text-center text-sm text-gray-400">Waiting for facilitator to start…</p>
        )}
      </div>
    </div>
  )
}
