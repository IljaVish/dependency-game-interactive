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

// Returns the side-project in the player lane, or null.
function getLaneSideProject(player, playerClaimed) {
  const sideDice = player.dice.filter(d => findCard(d.allocatedTo)?.type === 'sideProject')
  if (sideDice.length > 0) return { cardId: sideDice[0].allocatedTo, dice: sideDice }
  if (playerClaimed.sideProjectId) return { cardId: playerClaimed.sideProjectId, dice: [] }
  return null
}

export default function PlayerRow({
  player, players, phase, selectedDie, playerClaimed,
  onDieClick, onCardClick, onKeep, onPutToMarket, onDeallocateAll,
}) {
  const colour    = COLOURS[player.colour]

  const isPlan        = phase === 'plan'
  const isSet         = phase === 'set'
  const hasDieSelected = selectedDie !== null

  const laneTrainings  = getLaneTrainings(player)
  const laneSideProject = getLaneSideProject(player, playerClaimed)

  const pendingCardData = player.pendingCard ? findCard(player.pendingCard.cardId) : null
  const canKeep = !(pendingCardData?.type === 'project' && pendingCardData.depColour === player.colour)
  const hasSetAction = isSet && player.pendingCard
  const hasCardArea  = player.ownedCards.length > 0 || laneTrainings.length > 0 || laneSideProject

  return (
    <div className="bg-gray-700 rounded-xl p-4 flex flex-col gap-3">

      {/* ── Header: name + score + dice ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 w-28 flex-shrink-0">
          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: colour.hex }} />
          <span className="font-semibold text-sm">{player.name}</span>
        </div>

        <span className="text-gray-300 text-sm w-14 text-right flex-shrink-0">{player.totalScore} pts</span>

        <div className="flex gap-1.5">
          {player.dice.map(die => {
            const isSelected  = selectedDie?.dieId === die.id
            const isClickable = isPlan && !die.locked
            return (
              <div
                key={die.id}
                onClick={isClickable ? () => onDieClick(die) : undefined}
                className={isClickable ? 'cursor-pointer' : undefined}
              >
                <DieFace
                  value={die.value}
                  className={`w-9 h-9${isSelected ? ' ring-2 ring-yellow-300' : ''}`}
                  bgColor={die.locked ? '#374151' : die.allocatedTo ? colour.hex : '#e5e7eb'}
                  pipFill={die.locked || die.allocatedTo ? '#ffffff' : '#1f2937'}
                />
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {player.completedTrainings.length > 0 && (
            <div className="flex gap-1">
              {player.completedTrainings.map(t => (
                <span key={t} className="bg-cyan-800 text-cyan-200 text-xs rounded px-2 py-0.5 capitalize">{t}</span>
              ))}
            </div>
          )}
          {isPlan && player.dice.some(d => !d.locked && d.allocatedTo) && (
            <button onClick={onDeallocateAll}
              className="text-xs text-gray-400 hover:text-white border border-gray-500 hover:border-gray-300 rounded px-2 py-0.5 cursor-pointer">
              Reallocate all
            </button>
          )}
        </div>
      </div>

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
            const depColour = COLOURS[oc.depColour]
            const depPlayer = players?.find(p => p.colour === oc.depColour)
            const depAllocated = depPlayer
              ? depPlayer.dice.filter(d => d.allocatedTo === ownedEntry.cardId)
              : []
            return (
              <div key={ownedEntry.cardId} className="flex flex-col gap-1.5">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Project</span>
                <div className="flex items-start gap-3">
                  <ProjectCard
                    card={oc}
                    onClick={isPlan && hasDieSelected ? () => onCardClick(oc.id) : undefined}
                  />
                  {ownerDice.length > 0 && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <span className="text-xs text-gray-400">owner dice</span>
                      <div className="flex flex-col gap-1">
                        {ownerDice.map(die => (
                          <DieFace key={die.id} value={die.value} className="w-9 h-9"
                            bgColor={die.locked ? '#374151' : colour.hex} pipFill="#ffffff" />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-xs text-gray-400">dep dice</span>
                    <div className="flex flex-col gap-1">
                      {Array.from({ length: Math.max(depAllocated.length, oc.depDice.length) }, (_, i) => {
                        const die = depAllocated[i]
                        const req = oc.depDice[i]
                        return die
                          ? <DieFace key={die.id} value={die.value} className="w-9 h-9"
                              bgColor={die.locked ? '#374151' : depColour.hex} pipFill="#ffffff" />
                          : <div key={i}
                              className="w-9 h-9 rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-bold"
                              style={{ borderColor: depColour.hex, color: depColour.hex }}>
                              {req}
                            </div>
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Training cards in lane */}
          {laneTrainings.map(({ key, cardId, dice }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Training</span>
              <div className="flex items-start gap-3">
                <TrainingCard
                  trainingKey={key}
                  copies={null}
                  onClick={isPlan && hasDieSelected ? () => onCardClick(cardId) : undefined}
                />
                {dice.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-xs text-gray-400">dice</span>
                    <div className="flex flex-col gap-1">
                      {dice.map(die => (
                        <DieFace key={die.id} value={die.value} className="w-9 h-9"
                          bgColor={colour.hex} pipFill="#ffffff" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Side project in lane */}
          {laneSideProject && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Side Project</span>
              <div className="flex items-start gap-3">
                <SideProjectCard
                  onClick={isPlan && hasDieSelected ? () => onCardClick(laneSideProject.cardId) : undefined}
                />
                {laneSideProject.dice.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-xs text-gray-400">dice</span>
                    <div className="flex flex-col gap-1">
                      {laneSideProject.dice.map(die => (
                        <DieFace key={die.id} value={die.value} className="w-9 h-9"
                          bgColor={colour.hex} pipFill="#ffffff" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
