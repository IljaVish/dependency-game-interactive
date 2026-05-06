import DieFace from './DieFace.jsx'
import ProjectCard from './ProjectCard.jsx'
import TrainingCard from './TrainingCard.jsx'
import SideProjectCard from './SideProjectCard.jsx'
import { COLOURS } from '../data/colours.js'
import { findCard } from '../game/engine.js'

// Returns training cards that should appear in the player lane, merging engine state
// (has dice allocated) with UI-claimed state (no dice yet).
// Result: [{ key, cardId, dice[] }]
function getLaneTrainings(player, playerClaimed) {
  const result = {}

  // From engine: dice already allocated to a training copy
  player.dice.forEach(d => {
    const card = findCard(d.allocatedTo)
    if (card?.type === 'training') {
      const key = card.id.split('-')[1]
      if (!result[key]) result[key] = { cardId: card.id, dice: [] }
      result[key].dice.push(d)
    }
  })

  // From UI claim: card added to lane but no dice yet
  ;(playerClaimed.trainings ?? []).forEach(cardId => {
    const key = cardId.split('-')[1]
    if (!result[key]) result[key] = { cardId, dice: [] }
  })

  return Object.entries(result).map(([key, v]) => ({ key, ...v }))
}

// Returns the side-project in the player lane, or null.
function getLaneSideProject(player, playerClaimed) {
  const sideDice = player.dice.filter(d => findCard(d.allocatedTo)?.type === 'sideProject')
  if (sideDice.length > 0) return { cardId: sideDice[0].allocatedTo, dice: sideDice }
  if (playerClaimed.sideProjectId) return { cardId: playerClaimed.sideProjectId, dice: [] }
  return null
}

export default function PlayerRow({
  player, phase, selectedDie, playerClaimed,
  onDieClick, onCardClick, onDraw, onKeep, onPutToMarket,
}) {
  const colour    = COLOURS[player.colour]
  const ownedCard = player.ownedCard ? findCard(player.ownedCard.cardId) : null

  const isPlan        = phase === 'plan'
  const isSet         = phase === 'set'
  const hasDieSelected = selectedDie !== null

  const ownerDiceOnCard = ownedCard
    ? player.dice.filter(d => d.allocatedTo === player.ownedCard.cardId)
    : []

  const laneTrainings  = getLaneTrainings(player, playerClaimed)
  const laneSideProject = getLaneSideProject(player, playerClaimed)

  const hasSetAction = isSet && (player.needsDraw || player.pendingCard)
  const hasCardArea  = ownedCard || laneTrainings.length > 0 || laneSideProject

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

        {player.completedTrainings.length > 0 && (
          <div className="flex gap-1 ml-auto">
            {player.completedTrainings.map(t => (
              <span key={t} className="bg-cyan-800 text-cyan-200 text-xs rounded px-2 py-0.5 capitalize">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Set phase: draw / keep / put to market ── */}
      {hasSetAction && (
        <div className="flex items-start gap-4 pt-1 border-t border-gray-600">
          {player.needsDraw && !player.pendingCard && (
            <button
              onClick={onDraw}
              className="bg-purple-700 hover:bg-purple-600 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer font-medium"
            >
              Draw card
            </button>
          )}
          {player.pendingCard && (
            <div className="flex items-start gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Drawn card</span>
                <ProjectCard card={findCard(player.pendingCard.cardId)} />
              </div>
              <div className="flex flex-col gap-2 pt-7">
                <button onClick={onKeep}
                  className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer font-medium">
                  Keep it
                </button>
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

          {/* Owned project */}
          {ownedCard && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Project</span>
              <div className="flex items-start gap-3">
                <ProjectCard
                  card={ownedCard}
                  onClick={isPlan && hasDieSelected ? () => onCardClick(ownedCard.id) : undefined}
                />
                {ownerDiceOnCard.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-xs text-gray-400">owner dice</span>
                    <div className="flex flex-col gap-1">
                      {ownerDiceOnCard.map(die => (
                        <DieFace key={die.id} value={die.value} className="w-9 h-9"
                          bgColor={die.locked ? '#374151' : colour.hex} pipFill="#ffffff" />
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-xs text-gray-400">dep dice</span>
                  <div className="flex flex-col gap-1">
                    {ownedCard.depDice.map((req, i) => {
                      const depColour = COLOURS[ownedCard.depColour]
                      return (
                        <div key={i}
                          className="w-9 h-9 rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-bold"
                          style={{ borderColor: depColour.hex, color: depColour.hex }}>
                          {req}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

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
                          bgColor="#164e63" pipFill="#a5f3fc" />
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
                          bgColor="#f87171" pipFill="#ffffff" />
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
