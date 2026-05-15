import { useState, useEffect } from 'react'
import { useGameSession } from '../session/GameSessionContext.jsx'
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
const WORK_INIT = { reworkActive: false, reworkDieIds: [], setDieActive: false, settingDieId: null, pickerPos: null }
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

function pickSideProjectCardId(playerId, players, claimedByPlayer) {
  const copies = Array.from({ length: 6 }, (_, i) => `side-${i + 1}`)
  const takenByOthers = id =>
    players.some(p => p.id !== playerId && p.dice.some(d => d.allocatedTo === id)) ||
    Object.entries(claimedByPlayer).some(([pid, c]) => pid !== playerId && c?.sideProjectId === id)
  return (
    copies.find(id => players.find(p => p.id === playerId)?.dice.some(d => d.allocatedTo === id)) ??
    copies.find(id => !takenByOthers(id)) ??
    null
  )
}

const BASE_SCORE = 70 // simulation top-strategy average — used as par for the game-end summary

export default function GameBoard() {
  const { state, dispatch, onNewGame, myPlayerIndex, isFacilitator } = useGameSession()
  const { round, totalRounds, phase, marketplace, players, gameOver } = state
  const isNetworkMode = myPlayerIndex != null
  const isObserverMode = isFacilitator

  const myPlayer = isNetworkMode ? (players[myPlayerIndex] ?? null) : null
  const myPlayerId = myPlayer?.id ?? null
  const isDonePlanning = isNetworkMode && myPlayerId !== null && state.planReadyPlayers.includes(myPlayerId)
  const isDoneWorking  = isNetworkMode && myPlayerId !== null && state.workReadyPlayers.includes(myPlayerId)
  const allMyDiceSettled = myPlayer !== null && myPlayer.dice.every(d => d.value !== null || d.locked)
  const myCanRework = myPlayer !== null && myPlayer.completedTrainings.includes('rework') && !myPlayer.reworkUsed
  const iDoneWithSetPhase = isNetworkMode && phase === 'set'
    && myPlayer !== null && myPlayer.pendingCards.length === 0 && myPlayer.needsDraw === 0
  const setPhaseWaitCount = iDoneWithSetPhase
    ? players.filter(p => p.pendingCards.length > 0 || p.needsDraw > 0).length
    : 0

  // ── UI-only state ────────────────────────────────────────────────────────────
  const [selectedDie,           setSelectedDie]           = useState(null)
  const [allDiceSelectedFor,    setAllDiceSelectedFor]    = useState(null) // playerId | null
  // Tracks which side-project copy each player has claimed this round (UI-only, resets each round).
  // Shape: { [playerId]: { sideProjectId: string|null } }
  const [claimedByPlayer, setClaimedByPlayer] = useState({})
  const [rollAllPending,   setRollAllPending]  = useState(false)
  const [advancePending,   setAdvancePending]  = useState(false)
  const [workModes,        setWorkModes]       = useState({})
  const [activePlayerId,   setActivePlayerId]  = useState(() =>
    myPlayerIndex != null
      ? players[myPlayerIndex]?.id ?? null
      : players[0]?.id ?? null
  )

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
    if (phase === 'score') setClaimedByPlayer({})
  }

  function handleNetworkDonePlanning() {
    if (planToWorkWarnings.length > 0 && !advancePending) {
      setAdvancePending(true)
      return
    }
    dispatch({ type: 'PLAYER_DONE_PLANNING', playerId: players[myPlayerIndex].id })
    setAdvancePending(false)
  }

  // ── Plan phase — die selection & allocation ──────────────────────────────────

  function handleDieClick(playerId, die) {
    if (phase !== 'plan' || die.locked) return
    if (playerId !== activePlayerId) return
    setAllDiceSelectedFor(null)
    if (die.allocatedTo !== null) {
      dispatch({ type: 'DEALLOCATE_DIE', playerId, dieId: die.id })
      return
    }
    setSelectedDie(prev => prev?.dieId === die.id ? null : { playerId, dieId: die.id })
  }

  function handleSelectAll(playerId) {
    if (playerId !== activePlayerId) return
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

  function handleClaimTraining(key) {
    const cardId = pickTrainingCardId(key, activePlayerId, players)
    if (!cardId) return
    dispatch({ type: 'CLAIM_TRAINING_CARD', playerId: activePlayerId, cardId })
  }

  function handleClaimSideProject() {
    if (hasClaimedSideProject(activePlayerId)) return
    const cardId = pickSideProjectCardId(activePlayerId, players, claimedByPlayer)
    if (!cardId) return
    setClaimedByPlayer(prev => ({
      ...prev,
      [activePlayerId]: { ...prev[activePlayerId], sideProjectId: cardId },
    }))
  }

  // ── Set phase — marketplace claiming ────────────────────────────────────────

  function handleMarketplaceClaim(cardId) {
    dispatch({ type: 'TAKE_FROM_MARKETPLACE', playerId: activePlayerId, cardId })
  }

  // ── Work phase — mode management (lifted here so dep-die clicks across rows work) ──

  function getWorkMode(playerId) { return workModes[playerId] ?? WORK_INIT }

  function handleWorkDieClick(die, e) {
    const ownerColour = die.id.split('-')[0]
    const owner = players.find(p => p.colour === ownerColour)
    if (!owner || owner.id !== activePlayerId) return
    const canRework = owner.completedTrainings.includes('rework') && !owner.reworkUsed
      && owner.dice.every(d => d.value !== null)
    const canSetDie = owner.completedTrainings.includes('set') && !owner.setDieUsed
      && owner.dice.some(d => d.value === null)
    const rect = e?.currentTarget?.getBoundingClientRect()
    const pickerPos = rect ? { x: rect.right + 6, y: rect.top + rect.height / 2 } : null
    setWorkModes(prev => {
      const m = prev[owner.id] ?? WORK_INIT
      if (m.reworkActive && !die.locked) {
        const ids = m.reworkDieIds
        const next = ids.includes(die.id) ? ids.filter(id => id !== die.id)
          : ids.length < 2 ? [...ids, die.id] : ids
        return { ...prev, [owner.id]: { ...m, reworkDieIds: next } }
      }
      if (m.setDieActive && m.settingDieId === null && !die.locked)
        return { ...prev, [owner.id]: { ...m, settingDieId: die.id, pickerPos } }
      if (!m.reworkActive && !m.setDieActive && !die.locked) {
        if (canRework) return { ...prev, [owner.id]: { ...WORK_INIT, reworkActive: true, reworkDieIds: [die.id] } }
        if (canSetDie) return { ...prev, [owner.id]: { ...WORK_INIT, setDieActive: true, settingDieId: die.id, pickerPos } }
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

  function handleReturnToMarketplace(playerId, cardId) {
    dispatch({ type: 'RETURN_TO_MARKETPLACE', playerId, cardId })
  }
  function handleUnclaimTraining(playerId, cardId) {
    dispatch({ type: 'UNCLAIM_TRAINING_CARD', playerId, cardId })
  }
  function handleReturnSideProject(playerId) {
    setClaimedByPlayer(prev => {
      const next = { ...prev }
      if (next[playerId]) next[playerId] = { ...next[playerId], sideProjectId: null }
      return next
    })
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const isPlan         = phase === 'plan'
  const anyDiceSelected = !!selectedDie || !!allDiceSelectedFor

  const rollAllWarnings = phase === 'work' ? players
    .filter(p => p.dice.some(d => d.value === null)
      && p.completedTrainings.includes('set') && !p.setDieUsed)
    .map(p => `${p.name} hasn't used Set Die.`)
    : []

  const planToWorkWarnings = phase === 'plan'
    ? isNetworkMode
      ? (() => {
          const myP = players[myPlayerIndex]
          const n = myP ? myP.dice.filter(d => !d.locked && d.allocatedTo === null).length : 0
          return n > 0 ? [`You have ${n} unallocated dice.`] : []
        })()
      : players.flatMap(p => {
          const n = p.dice.filter(d => !d.locked && d.allocatedTo === null).length
          return n > 0 ? [`${p.name} has ${n} unallocated dice.`] : []
        })
    : []

  const trainingAvailable = Object.fromEntries(
    TRAINING_TYPES.map(key => {
      const inUse = [1, 2, 3].filter(n =>
        players.some(p => p.activeTrainingCards.some(tc => tc.cardId === `training-${key}-${n}`))
      ).length
      const completed = players.filter(p => p.completedTrainings.includes(key)).length
      return [key, 3 - inUse - completed]
    })
  )

  useEffect(() => {
    if (phase !== 'work' || !isNetworkMode || isObserverMode) return
    if (!myPlayerId || isDoneWorking) return
    if (allMyDiceSettled && !myCanRework) {
      dispatch({ type: 'PLAYER_DONE_WORKING', playerId: myPlayerId })
    }
  }, [phase, isNetworkMode, isObserverMode, myPlayerId, allMyDiceSettled, myCanRework, isDoneWorking])

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
          {phase === 'work' && !isNetworkMode && !isObserverMode && !rollAllPending && (
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
          {phase === 'work' && !isNetworkMode && !isObserverMode && rollAllPending && (
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
          {/* Pass-and-play: advance button for all phases */}
          {!isNetworkMode && !isObserverMode && !gameOver && (
            advancePending
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
          )}

          {/* Network mode: per-phase controls */}
          {isNetworkMode && !isObserverMode && !gameOver && (
            <>
              {/* Set phase: waiting indicator when this player has decided */}
              {iDoneWithSetPhase && setPhaseWaitCount > 0 && (
                <span className="text-sm text-gray-400 italic">
                  Waiting… {setPhaseWaitCount} player{setPhaseWaitCount !== 1 ? 's' : ''} deciding
                </span>
              )}

              {/* Plan phase */}
              {phase === 'plan' && (
                isDonePlanning
                  ? <span className="text-sm text-gray-400 italic">
                      Waiting… {state.planReadyPlayers.length}/{players.length} done planning
                    </span>
                  : advancePending
                    ? <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-yellow-300">{planToWorkWarnings.join(' ')}</span>
                        <button onClick={handleNetworkDonePlanning}
                          className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer">
                          Done anyway
                        </button>
                        <button onClick={() => setAdvancePending(false)}
                          className="text-sm text-gray-400 hover:text-white cursor-pointer">Cancel</button>
                      </div>
                    : <button
                        onClick={handleNetworkDonePlanning}
                        className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
                      >
                        Done planning
                      </button>
              )}

              {/* Work phase: auto-advances when all dice settled + no rework; button only to skip rework */}
              {phase === 'work' && (
                isDoneWorking
                  ? <span className="text-sm text-gray-400 italic">
                      Waiting… {state.workReadyPlayers.length}/{players.length} done working
                    </span>
                  : (myCanRework && allMyDiceSettled)
                    ? <button
                        onClick={() => dispatch({ type: 'PLAYER_DONE_WORKING', playerId: myPlayerId })}
                        className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
                      >
                        Done working
                      </button>
                    : null
              )}

              {/* Score phase */}
              {phase === 'score' && (
                <button
                  onClick={() => {
                    dispatch({ type: 'ADVANCE_TO_NEXT_ROUND' })
                    setSelectedDie(null)
                    setAllDiceSelectedFor(null)
                    setAdvancePending(false)
                    setWorkModes({})
                    setClaimedByPlayer({})
                  }}
                  className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
                >
                  Next Round →
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Board content — locked while waiting after Done planning */}
      <div className={isDonePlanning ? 'flex flex-col gap-4 pointer-events-none select-none opacity-60' : 'flex flex-col gap-4'}>

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
            const card = findCard(entry.cardId)
            return (
              <div key={entry.cardId}>
                <ProjectCard
                  card={card}
                  onClick={isPlan ? () => handleMarketplaceClaim(entry.cardId) : undefined}
                />
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
                <div key={key}>
                  <TrainingCard
                    trainingKey={key}
                    copies={trainingAvailable[key]}
                    onClick={isPlan && trainingAvailable[key] > 0 && !hasClaimedTraining(activePlayerId, key)
                      ? () => handleClaimTraining(key)
                      : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="border-l border-gray-700 pl-8 flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Side Projects</h2>
            <div className="flex-1 flex">
              <div>
                <SideProjectCard
                  onClick={isPlan && !hasClaimedSideProject(activePlayerId) ? () => handleClaimSideProject() : undefined}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Players ── */}
      <section className="bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Players</h2>
          {/* Player switcher — only in pass-and-play */}
          {!isNetworkMode && !isObserverMode && (
            <div className="flex gap-1.5">
              {players.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePlayerId(p.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                  style={{
                    backgroundColor: activePlayerId === p.id ? COLOURS[p.colour].hex : '#374151',
                    color: activePlayerId === p.id ? '#fff' : COLOURS[p.colour].hex,
                    outline: activePlayerId === p.id ? `2px solid ${COLOURS[p.colour].hex}` : 'none',
                    outlineOffset: '2px',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Active player's row is always first */}
        {[...players].sort((a, b) => a.id === activePlayerId ? -1 : b.id === activePlayerId ? 1 : 0)
          .map(player => (
          <PlayerRow
            key={player.id}
            player={player}
            players={players}
            phase={phase}
            selectedDie={selectedDie}
            isActivePlayer={player.id === activePlayerId}
            hasDieSelected={anyDiceSelected}
            allDiceSelected={allDiceSelectedFor === player.id}
            onSelectAll={() => handleSelectAll(player.id)}
            playerClaimed={claimedByPlayer[player.id] ?? {}}
            onDieClick={(die) => handleDieClick(player.id, die)}
            onCardClick={handleCardClick}
            onKeep={(cardId) => dispatch({ type: 'KEEP_CARD', playerId: player.id, cardId })}
            onPutToMarket={(cardId) => dispatch({ type: 'PUT_TO_MARKETPLACE', playerId: player.id, cardId })}
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
            round={round}
            onReturnToMarketplace={(cardId) => handleReturnToMarketplace(player.id, cardId)}
            onUnclaimTraining={(cardId) => handleUnclaimTraining(player.id, cardId)}
            onReturnSideProject={() => handleReturnSideProject(player.id)}
          />
        ))}
      </section>

      {/* ── Game-over modal ── */}
      {gameOver && (() => {
        const allEntries = state.roundScores.flatMap(rs => rs.entries)
        const projectsDelivered = allEntries.filter(e => e.description.startsWith('Project delivered:')).length
        const trainingsUnlocked = allEntries.filter(e => e.description.startsWith('Training:')).length
        const totalPenalties    = allEntries.filter(e => e.points < 0).reduce((s, e) => s + e.points, 0)
        const sideProjectPts    = allEntries.filter(e => e.description === 'Side project').reduce((s, e) => s + e.points, 0)
        const delta = state.teamScore - BASE_SCORE
        return (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md flex flex-col gap-6 shadow-2xl">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-white">Game Over</h2>
                <p className="text-gray-400 text-sm">{totalRounds} rounds · {players.length} players</p>
              </div>

              {/* Final score + par comparison */}
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Team score</p>
                  <p className="text-5xl font-bold text-white">{state.teamScore}</p>
                </div>
                <div className="mb-1.5">
                  <span className={`text-xl font-semibold ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {delta >= 0 ? '+' : ''}{delta} vs par ({BASE_SCORE})
                  </span>
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Projects delivered', value: projectsDelivered },
                  { label: 'Trainings unlocked', value: trainingsUnlocked },
                  { label: 'Side project pts',   value: sideProjectPts },
                  { label: 'Penalties',           value: totalPenalties, negative: true },
                ].map(({ label, value, negative }) => (
                  <div key={label} className="bg-gray-700 rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                    <p className={`text-xl font-bold ${negative && value < 0 ? 'text-red-400' : 'text-white'}`}>
                      {negative && value < 0 ? value : value}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={onNewGame}
                className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-3 rounded-xl font-semibold text-lg transition-colors cursor-pointer"
              >
                New Game
              </button>
            </div>
          </div>
        )
      })()}

      {/* Fixed Set Die value picker — appears next to whichever die was selected, regardless of which row it's in */}
      {(() => {
        const entry = Object.entries(workModes).find(([, m]) => m.settingDieId && m.pickerPos)
        if (!entry) return null
        const [pid, mode] = entry
        const { x, y } = mode.pickerPos
        return (
          <div
            className="fixed z-50 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-2 flex items-center gap-1.5"
            style={{
              left: x,
              top: y,
              transform: 'translateY(-50%)',
            }}
          >
            {[1, 2, 3, 4, 5, 6].map(v => (
              <button key={v} onClick={() => handleConfirmSetDie(pid, v)}
                className="w-8 h-8 rounded-lg bg-gray-600 hover:bg-green-700 text-white text-sm font-bold cursor-pointer">
                {v}
              </button>
            ))}
            <button onClick={() => handleCancelWorkMode(pid)}
              className="text-xs text-gray-400 hover:text-gray-200 cursor-pointer ml-1">
              ✕
            </button>
          </div>
        )
      })()}

      </div>{/* end board content lock wrapper */}
    </div>
  )
}
