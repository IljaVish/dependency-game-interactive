import { useState } from 'react'
import DieFace from './DieFace.jsx'
import ProjectCard from './ProjectCard.jsx'
import TrainingCard from './TrainingCard.jsx'
import SideProjectCard from './SideProjectCard.jsx'
import { COLOURS } from '../data/colours.js'
import { findCard } from '../game/engine.js'

// Returns training cards in the player's lane from engine state.
// Result: [{ key, cardId, dice[] }]
function getLaneTrainings(player) {
  return player.activeTrainingCards.map(({ cardId }) => ({
    key: cardId.split('-')[1],
    cardId,
    dice: player.dice.filter(d => d.allocatedTo === cardId),
  }))
}

const WORK_INIT = { reworkActive: false, reworkDieIds: [], setDieActive: false, settingDieId: null }

// Returns the side-project in the player lane, or null.
function getLaneSideProject(player, playerClaimed) {
  const sideDice = player.dice.filter(d => findCard(d.allocatedTo)?.type === 'sideProject')
  if (sideDice.length > 0) return { cardId: sideDice[0].allocatedTo, dice: sideDice }
  if (playerClaimed.sideProjectId) return { cardId: playerClaimed.sideProjectId, dice: [] }
  return null
}

export default function PlayerRow({
  player, players, phase, selectedDie, hasDieSelected, allDiceSelected, onSelectAll, playerClaimed,
  onDieClick, onCardClick, onKeep, onPutToMarket, onDeallocateAll,
  onRollDice, onUseRework, onSetDie,
}) {
  const colour = COLOURS[player.colour]

  const isPlan = phase === 'plan'
  const isSet  = phase === 'set'
  const isWork = phase === 'work'

  // Work phase local UI state — reset whenever phase changes (React prev-prop pattern, no effect needed).
  const [work, setWork] = useState(WORK_INIT)
  const [prevPhase, setPrevPhase] = useState(phase)
  if (prevPhase !== phase) {
    setPrevPhase(phase)
    setWork(WORK_INIT)
  }
  const { reworkActive, reworkDieIds, setDieActive, settingDieId } = work

  const laneTrainings   = getLaneTrainings(player)
  const laneSideProject = getLaneSideProject(player, playerClaimed)

  const pendingCardData = player.pendingCard ? findCard(player.pendingCard.cardId) : null
  const canKeep      = !(pendingCardData?.type === 'project' && pendingCardData.depColour === player.colour)
  const hasSetAction = isSet && player.pendingCard
  const hasCardArea  = player.ownedCards.length > 0 || laneTrainings.length > 0 || laneSideProject

  const canRoll   = isWork && player.dice.some(d => d.value === null)
  const canRework = isWork && player.completedTrainings.includes('rework') && !player.reworkUsed
  const canSetDie = isWork && player.completedTrainings.includes('set') && !player.setDieUsed

  function handleDieClick(die) {
    if (isPlan && !die.locked) {
      onDieClick(die)
    } else if (isWork && reworkActive && !die.locked) {
      setWork(prev => {
        const ids = prev.reworkDieIds
        const next = ids.includes(die.id) ? ids.filter(id => id !== die.id)
          : ids.length < 2 ? [...ids, die.id] : ids
        return { ...prev, reworkDieIds: next }
      })
    } else if (isWork && setDieActive && settingDieId === null && !die.locked) {
      setWork(prev => ({ ...prev, settingDieId: die.id }))
    } else if (isWork && !reworkActive && !setDieActive && !die.locked) {
      if (canRework) {
        setWork({ ...WORK_INIT, reworkActive: true, reworkDieIds: [die.id] })
      } else if (canSetDie) {
        setWork({ ...WORK_INIT, setDieActive: true, settingDieId: die.id })
      }
    }
  }

  function confirmRework() {
    onUseRework(reworkDieIds)
    setWork(WORK_INIT)
  }

  function confirmSetDie(value) {
    onSetDie(settingDieId, value)
    setWork(WORK_INIT)
  }

  return (
    <div className="bg-gray-700 rounded-xl p-4 flex flex-col gap-3">

      {/* ── Header: name + score + dice + actions ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 w-28 flex-shrink-0">
          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: colour.hex }} />
          <span className="font-semibold text-sm">{player.name}</span>
        </div>

        <span className="text-gray-300 text-sm w-14 text-right flex-shrink-0">{player.totalScore} pts</span>

        <div className="flex gap-1.5">
          {player.dice.map(die => {
            const isReworkSelected  = reworkDieIds.includes(die.id)
            const isSetSelected     = settingDieId === die.id
            const isAllSelected     = allDiceSelected && !die.locked && die.allocatedTo === null
            const isPlanClickable   = isPlan && !die.locked
            const isReworkClickable = isWork && (reworkActive || canRework) && !die.locked
            const isSetClickable    = isWork && (setDieActive || canSetDie) && settingDieId === null && !die.locked
            const isClickable       = isPlanClickable || isReworkClickable || isSetClickable

            const ringClass = (selectedDie?.dieId === die.id || isReworkSelected || isAllSelected)
              ? ' ring-2 ring-yellow-300'
              : isSetSelected ? ' ring-2 ring-green-400' : ''

            return (
              <div
                key={die.id}
                onClick={isClickable ? () => handleDieClick(die) : undefined}
                className={isClickable ? 'cursor-pointer' : undefined}
              >
                <DieFace
                  value={die.value}
                  className={`w-9 h-9${ringClass}`}
                  bgColor={die.locked ? '#374151' : die.allocatedTo ? colour.hex : '#e5e7eb'}
                  pipFill={die.locked || die.allocatedTo ? '#ffffff' : '#1f2937'}
                />
              </div>
            )
          })}
        </div>

        {/* Plan phase: select all free dice */}
        {isPlan && player.dice.some(d => !d.locked && d.allocatedTo === null) && (
          <button
            onClick={onSelectAll}
            className={`text-xs border rounded px-2 py-0.5 cursor-pointer ${
              allDiceSelected
                ? 'border-yellow-400 text-yellow-300'
                : 'border-gray-500 text-gray-400 hover:text-white hover:border-gray-300'
            }`}
          >
            Select all
          </button>
        )}

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {/* Training badges */}
          {player.completedTrainings.length > 0 && (
            <div className="flex gap-1">
              {player.completedTrainings.map(t => (
                <span key={t} className="bg-cyan-800 text-cyan-200 text-xs rounded px-2 py-0.5 capitalize">{t}</span>
              ))}
            </div>
          )}

          {/* Plan phase: reallocate all */}
          {isPlan && player.dice.some(d => !d.locked && d.allocatedTo) && (
            <button onClick={onDeallocateAll}
              className="text-xs text-gray-400 hover:text-white border border-gray-500 hover:border-gray-300 rounded px-2 py-0.5 cursor-pointer">
              Reallocate all
            </button>
          )}

          {/* Work phase: roll this player's dice */}
          {canRoll && (
            <button onClick={onRollDice}
              className="text-xs bg-orange-700 hover:bg-orange-600 text-white rounded px-2 py-0.5 cursor-pointer font-medium">
              Roll
            </button>
          )}

          {/* Work phase: rework (reroll 2 dice) */}
          {canRework && !reworkActive && (
            <button
              onClick={() => setWork({ ...WORK_INIT, reworkActive: true })}
              className="text-xs text-gray-400 hover:text-white border border-gray-500 hover:border-gray-300 rounded px-2 py-0.5 cursor-pointer">
              Rework
            </button>
          )}
          {reworkActive && (
            <>
              <span className="text-xs text-yellow-300">{reworkDieIds.length}/2</span>
              {reworkDieIds.length === 2 && (
                <button onClick={confirmRework}
                  className="text-xs bg-yellow-600 hover:bg-yellow-500 text-white rounded px-2 py-0.5 cursor-pointer">
                  Reroll
                </button>
              )}
              <button onClick={() => setWork(WORK_INIT)}
                className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">✕</button>
            </>
          )}

          {/* Work phase: set die to chosen value */}
          {canSetDie && !setDieActive && (
            <button
              onClick={() => setWork({ ...WORK_INIT, setDieActive: true })}
              className="text-xs text-gray-400 hover:text-white border border-gray-500 hover:border-gray-300 rounded px-2 py-0.5 cursor-pointer">
              Set die
            </button>
          )}
          {setDieActive && !settingDieId && (
            <>
              <span className="text-xs text-green-300">click a die</span>
              <button onClick={() => setWork(WORK_INIT)}
                className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">✕</button>
            </>
          )}
        </div>
      </div>

      {/* Work phase: value picker shown after a die is selected for Set */}
      {setDieActive && settingDieId && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-600">
          <span className="text-xs text-gray-400">Set to:</span>
          {[1, 2, 3, 4, 5, 6].map(v => (
            <button key={v} onClick={() => confirmSetDie(v)}
              className="w-7 h-7 rounded bg-gray-600 hover:bg-green-700 text-sm font-bold cursor-pointer">
              {v}
            </button>
          ))}
          <button onClick={() => setWork(WORK_INIT)}
            className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer ml-1">
            Cancel
          </button>
        </div>
      )}

      {/* ── Set phase: keep / put to market ── */}
      {hasSetAction && (
        <div className="flex items-start gap-4 pt-1 border-t border-gray-600">
          {player.pendingCard && (
            <div className="flex items-start gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Drawn card</span>
                <ProjectCard card={findCard(player.pendingCard.cardId)} />
              </div>
              <div className="flex flex-col gap-2 pt-7">
                {canKeep && (
                  <button onClick={onKeep}
                    className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer font-medium">
                    Keep it
                  </button>
                )}
                <button onClick={onPutToMarket}
                  className="bg-yellow-700 hover:bg-yellow-600 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer font-medium">
                  → Market
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Card area: project / training / side project ── */}
      {hasCardArea && (
        <div className="flex gap-6 flex-wrap pt-1 border-t border-gray-600">

          {/* Owned projects */}
          {player.ownedCards.map(ownedEntry => {
            const oc = findCard(ownedEntry.cardId)
            const ownerDice = player.dice.filter(d => d.allocatedTo === ownedEntry.cardId)
            const depDice   = players?.filter(p => p.colour !== player.colour)
              .flatMap(p => p.dice.filter(d => d.allocatedTo === ownedEntry.cardId)) ?? []
            return (
              <div key={ownedEntry.cardId} className="flex flex-col gap-1.5">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Project</span>
                <ProjectCard
                  card={oc}
                  onClick={isPlan && hasDieSelected ? () => onCardClick(oc.id) : undefined}
                  allocatedOwnerDice={ownerDice}
                  allocatedDepDice={depDice}
                  ownerColour={player.colour}
                  onOwnerStagingDieClick={isWork && (reworkActive || setDieActive || canRework || canSetDie) ? handleDieClick : undefined}
                  reworkDieIds={reworkDieIds}
                  settingDieId={settingDieId}
                />
              </div>
            )
          })}

          {/* Training cards in lane */}
          {laneTrainings.map(({ key, cardId, dice }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Training</span>
              <TrainingCard
                trainingKey={key}
                copies={null}
                onClick={isPlan && hasDieSelected ? () => onCardClick(cardId) : undefined}
                allocatedDice={dice}
                diceColour={player.colour}
                onStagingDieClick={isWork && (reworkActive || setDieActive || canRework || canSetDie) ? handleDieClick : undefined}
                reworkDieIds={reworkDieIds}
                settingDieId={settingDieId}
              />
            </div>
          ))}

          {/* Side project in lane */}
          {laneSideProject && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Side Project</span>
              <SideProjectCard
                onClick={isPlan && hasDieSelected ? () => onCardClick(laneSideProject.cardId) : undefined}
                allocatedDice={laneSideProject.dice}
                diceColour={player.colour}
                onStagingDieClick={isWork && (reworkActive || setDieActive || canRework || canSetDie) ? handleDieClick : undefined}
                reworkDieIds={reworkDieIds}
                settingDieId={settingDieId}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
