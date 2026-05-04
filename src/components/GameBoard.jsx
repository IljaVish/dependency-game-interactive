import ProjectCard from './ProjectCard.jsx'
import TrainingCard from './TrainingCard.jsx'
import SideProjectCard from './SideProjectCard.jsx'
import PlayerRow from './PlayerRow.jsx'
import { findCard } from '../game/engine.js'

const PHASE_LABELS  = { set: 'SET', plan: 'PLAN', work: 'WORK', score: 'SCORE' }
const PHASE_COLOURS = {
  set:   'bg-purple-700 text-purple-100',
  plan:  'bg-blue-700   text-blue-100',
  work:  'bg-orange-600 text-orange-100',
  score: 'bg-green-700  text-green-100',
}
const NEXT_ACTION = {
  set:   'ADVANCE_TO_PLAN',
  plan:  'ADVANCE_TO_WORK',
  work:  'ADVANCE_TO_SCORE',
  score: 'ADVANCE_TO_NEXT_ROUND',
}
const NEXT_LABEL = {
  set:   'Plan →',
  plan:  'Work →',
  work:  'Score →',
  score: 'Next Round →',
}

const TRAINING_TYPES = ['rework', 'support', 'set']
const MARKETPLACE_SLOTS = 3

export default function GameBoard({ state, dispatch }) {
  const { round, totalRounds, phase, marketplace, players, gameOver } = state

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between bg-gray-800 rounded-xl px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold">Round {round} / {totalRounds}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-widest ${PHASE_COLOURS[phase]}`}>
            {PHASE_LABELS[phase]}
          </span>
        </div>
        {gameOver
          ? <span className="text-green-400 font-bold">Game over — final score: {state.teamScore}</span>
          : <button
              onClick={() => dispatch({ type: NEXT_ACTION[phase] })}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
            >
              {NEXT_LABEL[phase]}
            </button>
        }
      </div>

      {/* ── Marketplace ── */}
      <section className="bg-gray-800 rounded-xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Marketplace</h2>
        <div className="flex gap-4 flex-wrap">
          {marketplace.map(entry => (
            <ProjectCard key={entry.cardId} card={findCard(entry.cardId)} />
          ))}
          {Array.from({ length: Math.max(0, MARKETPLACE_SLOTS - marketplace.length) }, (_, i) => (
            <div key={i} className="w-56 h-40 border-2 border-dashed border-gray-600 rounded-2xl" />
          ))}
        </div>
      </section>

      {/* ── Training + Side Projects ── */}
      <div className="flex gap-4">
        <section className="bg-gray-800 rounded-xl p-4 flex-1">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Training</h2>
          <div className="flex gap-3 flex-wrap">
            {TRAINING_TYPES.map(key => (
              <TrainingCard key={key} trainingKey={key} copies={3} />
            ))}
          </div>
        </section>

        <section className="bg-gray-800 rounded-xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Side Projects</h2>
          <SideProjectCard />
        </section>
      </div>

      {/* ── Players ── */}
      <section className="bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Players</h2>
        {players.map(player => (
          <PlayerRow key={player.id} player={player} />
        ))}
      </section>
    </div>
  )
}
