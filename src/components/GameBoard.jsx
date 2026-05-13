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
const WORK_INIT = { reworkActive: false, reworkDieIds: [], setDieActive: false, settingDieId: null }
const MARKETPLACE_SLOTS = 3

function fmtDesc(desc) {
  return desc.replace(/project-(\w+)-(\d+)/, (_, colour, n) =>
    `${colour[0].toUpperCase()}${colour.slice(1)} project #${n}`
  )
}

function pickTrainingCardId(key, playerId, players) {
  const copies = [1, 2, 3].map(n => `training-${key}-${n}`)
  const player = players.find(p => p.id === playerId)
  const existing = player?.activeTrainingCards.find(tc => copies.includes(tc.cardId))
  if (existing) return existing.cardId
  return copies.find(id => !players.some(p => p.activeTrainingCards.some(tc => tc.cardId === id))) ?? null
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
  const [selectedDie,           setSelectedDie]           = useState(null)
  const [allDiceSelectedFor,    setAllDiceSelectedFor]    = useState(null) // playerId | null
  const [claimingCardId,        setClaimingCardId]        = useState(null)  // marketplace
  const [claimingTrainingKey,   setClaimingTrainingKey]   = useState(null) // training picker
  const [claimingSideProject,   setClaimingSideProject]   = useState(false) // side-project picker
  // Tracks which side-project copy each player has claimed this round (UI-only, resets each round).
  // Shape: { [playerId]: { sideProjectId: string|null } }
  const [claimedByPlayer, setClaimedByPlayer] = useState({})
  const [rollAllPending,   setRollAllPending]  = useState(false)
  const [advancePending,   setAdvancePending]  = useState(false)
  const [workModes,        setWorkModes]       = useState({})

  function handleAdvancePhase() {
    if (phase === 'plan' && planToWorkWarnings.length > 0 && !advancePending) {
      setAdvancePending(true)
      return
    }
    dispatch({ type: NEXT_ACTION[phase] })
    setSelectedDie(null)
    setAllDiceSelectedFor(null)
    setRollAllPending(false)
    setAdvancePending(false)
    setWorkModes({})
    setClaimingCardId(null)
    setClaimingTrainingKey(null)
    setClaimingSideProject(false)
    if (phase === 'score') setClaimedByPlayer({})
  }

  // ── Plan phase — die selection & allocation ──────────────────────────────────

  function handleDieClick(playerId, die) {
    if (phase !== 'plan' || die.locked) return
    setAllDiceSelectedFor(null)
    if (die.allocatedTo !== null) {
      dispatch({ type: 'DEALLOCATE_DIE', playerId, dieId: die.id })
      return
    }
    setSelectedDie(prev => prev?.dieId === die.id ? null : { playerId, dieId: die.id })
  }

  function handleSelectAll(playerId) {
    setSelectedDie(null)
    setAllDiceSelectedFor(prev => prev === playerId ? null : playerId)
  }

  function handleCardClick(cardId) {
    if (phase !== 'plan') return
    if (allDiceSelectedFor) {
      dispatch({ type: 'ALLOCATE_ALL_TO_CARD', playerId: allDiceSelectedFor, cardId })
      setAllDiceSelectedFor(null)
      return
    }
    if (!selectedDie) return
    dispatch({ type: 'ALLOCATE_DIE', playerId: selectedDie.playerId, dieId: selectedDie.dieId, cardId })
    setSelectedDie(null)
  }

  // ── Plan phase — claiming training / side-project into player lane ───────────

  function hasClaimedTraining(playerId, key) {
    const player = players.find(p => p.id === playerId)
    if (!player) return false
    if (player.completedTrainings.includes(key)) return true
    const copies = [1, 2, 3].map(n => `training-${key}-${n}`)
    return player.activeTrainingCards.some(tc => copies.includes(tc.cardId))
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
    dispatch({ type: 'CLAIM_TRAINING_CARD', playerId, cardId })
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

  // ── Work phase — mode management (lifted here so dep-die clicks across rows work) ──

  function getWorkMode(playerId) { return workModes[playerId] ?? WORK_INIT }

  function handleWorkDieClick(die) {
    const ownerColour = die.id.split('-')[0]
    const owner = players.find(p => p.colour === ownerColour)
    if (!owner) return
    const canRework = owner.completedTrainings.includes('rework') && !owner.reworkUsed
      && owner.dice.every(d => d.value !== null)
    const canSetDie = owner.completedTrainings.includes('set') && !owner.setDieUsed
      && owner.dice.some(d => d.value === null)
    setWorkModes(prev => {
      const m = prev[owner.id] ?? WORK_INIT
      if (m.reworkActive && !die.locked) {
        const ids = m.reworkDieIds
        const next = ids.includes(die.id) ? ids.filter(id => id !== die.id)
          : ids.length < 2 ? [...ids, die.id] : ids
        return { ...prev, [owner.id]: { ...m, reworkDieIds: next } }
      }
      if (m.setDieActive && m.settingDieId === null && !die.locked)
        return { ...prev, [owner.id]: { ...m, settingDieId: die.id } }
      if (!m.reworkActive && !m.setDieActive && !die.locked) {
        if (canRework) return { ...prev, [owner.id]: { ...WORK_INIT, reworkActive: true, reworkDieIds: [die.id] } }
        if (canSetDie) return { ...prev, [owner.id]: { ...WORK_INIT, setDieActive: true, settingDieId: die.id } }
      }
      return prev
    })
  }

  function handleActivateRework(playerId) {
    setWorkModes(prev => ({ ...prev, [playerId]: { ...WORK_INIT, reworkActive: true } }))
  }
  function handleActivateSetDie(playerId) {
    setWorkModes(prev => ({ ...prev, [playerId]: { ...WORK_INIT, setDieActive: true } }))
  }
  function handleConfirmRework(playerId) {
    const mode = getWorkMode(playerId)
    dispatch({ type: 'USE_REWORK', playerId, dieIds: mode.reworkDieIds })
    setWorkModes(prev => { const n = { ...prev }; delete n[playerId]; return n })
  }
  function handleConfirmSetDie(playerId, value) {
    const mode = getWorkMode(playerId)
    dispatch({ type: 'SET_DIE_VALUE', playerId, dieId: mode.settingDieId, value })
    setWorkModes(prev => { const n = { ...prev }; delete n[playerId]; return n })
  }
  function handleCancelWorkMode(playerId) {
    setWorkModes(prev => { const n = { ...prev }; delete n[playerId]; return n })
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const isPlan         = phase === 'plan'
  const anyDiceSelected = !!selectedDie || !!allDiceSelectedFor

  const rollAllWarnings = phase === 'work' ? players
    .filter(p => p.dice.some(d => d.value === null)
      && p.completedTrainings.includes('set') && !p.setDieUsed)
    .map(p => `${p.name} hasn't used Set Die.`)
    : []

  const planToWorkWarnings = phase === 'plan' ? players.flatMap(p => {
    const n = p.dice.filter(d => !d.locked && d.allocatedTo === null).length
    return n > 0 ? [`${p.name} has ${n} unallocated dice.`] : []
  }) : []

  const trainingAvailable = Object.fromEntries(
    TRAINING_TYPES.map(key => {
      const inUse = [1, 2, 3].filter(n =>
        players.some(p => p.activeTrainingCards.some(tc => tc.cardId === `training-${key}-${n}`))
      ).length
      const completed = players.filter(p => p.completedTrainings.includes(key)).length
      return [key, 3 - inUse - completed]
    })
  )

  function playerPicker(onSelect, onCancel, excludeIds = []) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-gray-400 mb-0.5">Who works on this?</span>
        {players.filter(p => !excludeIds.includes(p.id)).map(p => (
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
          <span className="text-sm text-gray-300">Team: <span className="font-semibold text-white">{state.teamScore}</span> pts</span>
        </div>
        <div className="flex items-center gap-3">
          {phase === 'work' && !rollAllPending && (
            <button
              onClick={() => {
                if (rollAllWarnings.length > 0) { setRollAllPending(true) }
                else { dispatch({ type: 'ROLL_ALL_DICE' }) }
              }}
              disabled={!players.some(p => p.dice.some(d => d.value === null))}
              className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer"
            >
              Roll all dice
            </button>
          )}
          {rollAllPending && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-yellow-300">{rollAllWarnings.join(' ')}</span>
              <button
                onClick={() => { dispatch({ type: 'ROLL_ALL_DICE' }); setRollAllPending(false) }}
                className="bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded-lg font-semibold text-sm cursor-pointer"
              >
                Roll anyway
              </button>
              <button onClick={() => setRollAllPending(false)}
                className="text-sm text-gray-400 hover:text-white cursor-pointer">Cancel</button>
            </div>
          )}
          {gameOver
            ? <span className="text-green-400 font-bold">Game over — final score: {state.teamScore}</span>
            : advancePending
              ? <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-yellow-300">{planToWorkWarnings.join(' ')}</span>
                  <button onClick={handleAdvancePhase}
                    className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer">
                    Start Work anyway
                  </button>
                  <button onClick={() => setAdvancePending(false)}
                    className="text-sm text-gray-400 hover:text-white cursor-pointer">Cancel</button>
                </div>
              : <button
                  onClick={handleAdvancePhase}
                  className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
                >
                  {NEXT_LABEL[phase]}
                </button>
          }
        </div>
      </div>

      {/* ── Score phase: round summary ── */}
      {phase === 'score' && (() => {
        const rs = state.roundScores[state.roundScores.length - 1]
        if (!rs) return null
        const roundDelta = rs.entries.reduce((s, e) => s + e.points, 0)
        return (
          <section className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Round {round} Score</h2>
            {rs.entries.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Nothing scored this round.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {rs.entries.map((entry, i) => {
                  const p = entry.playerId ? players.find(pl => pl.id === entry.playerId) : null
                  const hex = p ? COLOURS[p.colour].hex : '#9ca3af'
                  const isTraining = entry.points === 0
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="w-20 text-xs font-medium flex-shrink-0" style={{ color: hex }}>
                        {p ? p.name : 'Team'}
                      </span>
                      <span className="flex-1 text-gray-300">{fmtDesc(entry.description)}</span>
                      {isTraining
                        ? <span className="text-cyan-400 text-xs font-semibold flex-shrink-0">✓ unlocked</span>
                        : <span className={`font-semibold flex-shrink-0 ${entry.points > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {entry.points > 0 ? '+' : ''}{entry.points} pts
                          </span>
                      }
                    </div>
                  )
                })}
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-600 text-sm font-semibold">
                  <span className="text-gray-400">Round {round} total</span>
                  <span className={roundDelta >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {roundDelta > 0 ? '+' : ''}{roundDelta} pts
                  </span>
                </div>
              </div>
            )}
          </section>
        )
      })()}

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
                  onClick={isPlan ? () => setClaimingCardId(isClaiming ? null : entry.cardId) : undefined}
                />
                {isClaiming && playerPicker(
                  pid => handleMarketplaceClaim(pid, entry.cardId),
                  () => setClaimingCardId(null),
                  card.type === 'project'
                    ? players.filter(p => p.colour === card.depColour).map(p => p.id)
                    : [],
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
            players={players}
            phase={phase}
            selectedDie={selectedDie}
            hasDieSelected={anyDiceSelected}
            allDiceSelected={allDiceSelectedFor === player.id}
            onSelectAll={() => handleSelectAll(player.id)}
            playerClaimed={claimedByPlayer[player.id] ?? {}}
            onDieClick={(die) => handleDieClick(player.id, die)}
            onCardClick={handleCardClick}
            onKeep={() => dispatch({ type: 'KEEP_CARD', playerId: player.id })}
            onPutToMarket={() => dispatch({ type: 'PUT_TO_MARKETPLACE', playerId: player.id })}
            onDeallocateAll={() => dispatch({ type: 'DEALLOCATE_ALL_NON_LOCKED', playerId: player.id })}
            onRollDice={() => dispatch({ type: 'ROLL_PLAYER_DICE', playerId: player.id })}
            workMode={getWorkMode(player.id)}
            workModes={workModes}
            onWorkDieClick={handleWorkDieClick}
            onActivateRework={() => handleActivateRework(player.id)}
            onActivateSetDie={() => handleActivateSetDie(player.id)}
            onConfirmRework={() => handleConfirmRework(player.id)}
            onConfirmSetDie={(value) => handleConfirmSetDie(player.id, value)}
            onCancelWorkMode={() => handleCancelWorkMode(player.id)}
          />
        ))}
      </section>
    </div>
  )
}
