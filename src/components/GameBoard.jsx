import { useState } from 'react'
import ProjectCard from './ProjectCard.jsx'
import TrainingCard from './TrainingCard.jsx'
import SideProjectCard from './SideProjectCard.jsx'
import PlayerRow from './PlayerRow.jsx'
import { findCard } from '../game/engine.js'
import { COLOURS } from '../data/colours.js'

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

function pickTrainingCardId(key, playerId, players) {
  const copies = [1, 2, 3].map(n => `training-${key}-${n}`)
  return (
    copies.find(id => players.find(p => p.id === playerId)?.dice.some(d => d.allocatedTo === id)) ??
    copies.find(id => !players.some(p => p.id !== playerId && p.dice.some(d => d.allocatedTo === id))) ??
    null
  )
}

function pickSideProjectCardId(playerId, players) {
  const copies = Array.from({ length: 6 }, (_, i) => `side-${i + 1}`)
  return (
    copies.find(id => players.find(p => p.id === playerId)?.dice.some(d => d.allocatedTo === id)) ??
    copies.find(id => !players.some(p => p.id !== playerId && p.dice.some(d => d.allocatedTo === id))) ??
    null
  )
}

export default function GameBoard({ state, dispatch }) {
  const { round, totalRounds, phase, marketplace, players, gameOver } = state

  // ── UI-only state ────────────────────────────────────────────────────────────
  const [selectedDie,        setSelectedDie]        = useState(null)
  const [claimingCardId,     setClaimingCardId]     = useState(null)  // marketplace
  const [claimingTrainingKey, setClaimingTrainingKey] = useState(null) // training picker
  const [claimingSideProject, setClaimingSideProject] = useState(false) // side-project picker
  // Tracks which training copies / side-project copies each player has claimed this round
  // (before any dice are allocated). Shape: { [playerId]: { trainings: string[], sideProjectId: string|null } }
  const [claimedByPlayer, setClaimedByPlayer] = useState({})

  function handleAdvancePhase() {
    dispatch({ type: NEXT_ACTION[phase] })
    setSelectedDie(null)
    setClaimingCardId(null)
    setClaimingTrainingKey(null)
    setClaimingSideProject(false)
    if (phase === 'score') setClaimedByPlayer({})
  }

  // ── Plan phase — die selection & allocation ──────────────────────────────────

  function handleDieClick(playerId, die) {
    if (phase !== 'plan' || die.locked) return
    if (die.allocatedTo !== null) {
      dispatch({ type: 'DEALLOCATE_DIE', playerId, dieId: die.id })
      return
    }
    setSelectedDie(prev => prev?.dieId === die.id ? null : { playerId, dieId: die.id })
  }

  function handleCardClick(cardId) {
    if (phase !== 'plan' || !selectedDie) return
    dispatch({ type: 'ALLOCATE_DIE', playerId: selectedDie.playerId, dieId: selectedDie.dieId, cardId })
    setSelectedDie(null)
  }

  // ── Plan phase — claiming training / side-project into player lane ───────────

  function hasClaimedTraining(playerId, key) {
    const copies = [1, 2, 3].map(n => `training-${key}-${n}`)
    const player = players.find(p => p.id === playerId)
    return (
      player?.dice.some(d => copies.includes(d.allocatedTo)) ||
      (claimedByPlayer[playerId]?.trainings ?? []).some(id => copies.includes(id))
    )
  }

  function hasClaimedSideProject(playerId) {
    const player = players.find(p => p.id === playerId)
    return (
      player?.dice.some(d => findCard(d.allocatedTo)?.type === 'sideProject') ||
      !!claimedByPlayer[playerId]?.sideProjectId
    )
  }

  function handleClaimTraining(key, playerId) {
    const cardId = pickTrainingCardId(key, playerId, players)
    if (!cardId) return
    const copies = [1, 2, 3].map(n => `training-${key}-${n}`)
    setClaimedByPlayer(prev => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        trainings: [
          ...((prev[playerId]?.trainings ?? []).filter(id => !copies.includes(id))),
          cardId,
        ],
      },
    }))
    setClaimingTrainingKey(null)
  }

  function handleClaimSideProject(playerId) {
    const cardId = pickSideProjectCardId(playerId, players)
    if (!cardId) return
    setClaimedByPlayer(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], sideProjectId: cardId },
    }))
    setClaimingSideProject(false)
  }

  // ── Set phase — marketplace claiming ────────────────────────────────────────

  function handleMarketplaceClaim(playerId, cardId) {
    dispatch({ type: 'TAKE_FROM_MARKETPLACE', playerId, cardId })
    setClaimingCardId(null)
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const isPlan = phase === 'plan'
  const isSet  = phase === 'set'

  const trainingAvailable = Object.fromEntries(
    TRAINING_TYPES.map(key => {
      const inUse = [1, 2, 3].filter(n =>
        players.some(p => p.dice.some(d => d.allocatedTo === `training-${key}-${n}`))
      ).length
      return [key, 3 - inUse]
    })
  )

  function playerPicker(onSelect, onCancel) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-gray-400 mb-0.5">Who works on this?</span>
        {players.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-left cursor-pointer font-medium"
            style={{ color: COLOURS[p.colour].hex }}
          >
            {p.name}
          </button>
        ))}
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-300 text-left mt-0.5 cursor-pointer">
          Cancel
        </button>
      </div>
    )
  }

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
              onClick={handleAdvancePhase}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
            >
              {NEXT_LABEL[phase]}
            </button>
        }
      </div>

      {/* ── Marketplace ── */}
      <section className="bg-gray-800 rounded-xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Marketplace</h2>
        <div className="flex gap-4 flex-wrap items-start">
          {marketplace.map(entry => {
            const card      = findCard(entry.cardId)
            const isClaiming = claimingCardId === entry.cardId
            return (
              <div key={entry.cardId} className="flex flex-col gap-2">
                <ProjectCard
                  card={card}
                  onClick={isSet ? () => setClaimingCardId(isClaiming ? null : entry.cardId) : undefined}
                />
                {isClaiming && playerPicker(
                  pid => handleMarketplaceClaim(pid, entry.cardId),
                  () => setClaimingCardId(null),
                )}
              </div>
            )
          })}
          {Array.from({ length: Math.max(0, MARKETPLACE_SLOTS - marketplace.length) }, (_, i) => (
            <div key={i} className="w-56 h-40 border-2 border-dashed border-gray-600 rounded-2xl" />
          ))}
        </div>
      </section>

      {/* ── Training + Side Projects ── */}
      <section className="bg-gray-800 rounded-xl p-4">
        <div className="flex gap-8 items-stretch">
          <div className="flex-1">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Training</h2>
            <div className="flex gap-4 flex-wrap items-start">
              {TRAINING_TYPES.map(key => (
                <div key={key} className="flex flex-col gap-2">
                  <TrainingCard
                    trainingKey={key}
                    copies={trainingAvailable[key]}
                    onClick={isPlan && trainingAvailable[key] > 0
                      ? () => setClaimingTrainingKey(claimingTrainingKey === key ? null : key)
                      : undefined}
                  />
                  {claimingTrainingKey === key && playerPicker(
                    pid => hasClaimedTraining(pid, key) ? setClaimingTrainingKey(null) : handleClaimTraining(key, pid),
                    () => setClaimingTrainingKey(null),
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="border-l border-gray-700 pl-8 flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Side Projects</h2>
            <div className="flex-1 flex">
              <div className="flex flex-col gap-2">
                <SideProjectCard
                  onClick={isPlan ? () => setClaimingSideProject(!claimingSideProject) : undefined}
                />
                {claimingSideProject && playerPicker(
                  pid => hasClaimedSideProject(pid) ? setClaimingSideProject(false) : handleClaimSideProject(pid),
                  () => setClaimingSideProject(false),
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Players ── */}
      <section className="bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Players</h2>
        {players.map(player => (
          <PlayerRow
            key={player.id}
            player={player}
            phase={phase}
            selectedDie={selectedDie}
            playerClaimed={claimedByPlayer[player.id] ?? {}}
            onDieClick={(die) => handleDieClick(player.id, die)}
            onCardClick={handleCardClick}
            onDraw={() => dispatch({ type: 'DRAW_CARD', playerId: player.id })}
            onKeep={() => dispatch({ type: 'KEEP_CARD', playerId: player.id })}
            onPutToMarket={() => dispatch({ type: 'PUT_TO_MARKETPLACE', playerId: player.id })}
          />
        ))}
      </section>
    </div>
  )
}
