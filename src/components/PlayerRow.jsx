import DieFace from './DieFace.jsx'
import ProjectCard from './ProjectCard.jsx'
import { COLOURS } from '../data/colours.js'
import { findCard } from '../game/engine.js'

export default function PlayerRow({ player }) {
  const colour = COLOURS[player.colour]
  const ownedCard = player.ownedCard ? findCard(player.ownedCard.cardId) : null

  // Partition dice by where they're allocated
  const freeDice      = player.dice.filter(d => d.allocatedTo === null)
  const ownerDiceOnCard = ownedCard
    ? player.dice.filter(d => d.allocatedTo === player.ownedCard.cardId)
    : []
  const trainingDice  = player.dice.filter(d => findCard(d.allocatedTo)?.type === 'training')
  const sideDice      = player.dice.filter(d => findCard(d.allocatedTo)?.type === 'sideProject')

  return (
    <div className="bg-gray-700 rounded-xl p-4 flex flex-col gap-3">

      {/* ── Header row: identity + dice summary ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 w-28 flex-shrink-0">
          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: colour.hex }} />
          <span className="font-semibold text-sm">{player.name}</span>
        </div>

        <span className="text-gray-300 text-sm w-14 text-right flex-shrink-0">{player.totalScore} pts</span>

        {/* All 5 dice, colour-coded by state */}
        <div className="flex gap-1.5">
          {player.dice.map(die => (
            <DieFace
              key={die.id}
              value={die.value}
              className="w-9 h-9"
              bgColor={die.locked ? '#374151' : die.allocatedTo ? colour.hex : '#e5e7eb'}
              pipFill={die.locked || die.allocatedTo ? '#ffffff' : '#1f2937'}
            />
          ))}
        </div>

        {/* Completed training badges */}
        {player.completedTrainings.length > 0 && (
          <div className="flex gap-1 ml-auto">
            {player.completedTrainings.map(t => (
              <span key={t} className="bg-cyan-800 text-cyan-200 text-xs rounded px-2 py-0.5 capitalize">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Card area: only shown when player has something active ── */}
      {(ownedCard || trainingDice.length > 0 || sideDice.length > 0) && (
        <div className="flex gap-6 flex-wrap pt-1 border-t border-gray-600">

          {/* Owned project card + owner dice allocated to it */}
          {ownedCard && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Project</span>
              <div className="flex items-start gap-3">
                <ProjectCard card={ownedCard} />

                {/* Owner dice allocated to this card, stacked to the right */}
                {ownerDiceOnCard.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-xs text-gray-400">owner dice</span>
                    <div className="flex flex-col gap-1">
                      {ownerDiceOnCard.map(die => (
                        <DieFace
                          key={die.id}
                          value={die.value}
                          className="w-9 h-9"
                          bgColor={die.locked ? '#374151' : colour.hex}
                          pipFill="#ffffff"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Dep dice placeholder — contributed by other players */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-xs text-gray-400">dep dice</span>
                  <div className="flex flex-col gap-1">
                    {ownedCard.depDice.map((req, i) => {
                      const depColour = COLOURS[ownedCard.depColour]
                      // Find any dep die already allocated to this card by any player
                      return (
                        <div
                          key={i}
                          className="w-9 h-9 rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-bold"
                          style={{ borderColor: depColour.hex, color: depColour.hex }}
                        >
                          {req}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dice allocated to training */}
          {trainingDice.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Training</span>
              <div className="flex gap-1">
                {trainingDice.map(die => (
                  <DieFace key={die.id} value={die.value} className="w-9 h-9" bgColor="#164e63" pipFill="#a5f3fc" />
                ))}
              </div>
            </div>
          )}

          {/* Dice allocated to side project */}
          {sideDice.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Side project</span>
              <div className="flex gap-1">
                {sideDice.map(die => (
                  <DieFace key={die.id} value={die.value} className="w-9 h-9" bgColor="#f87171" pipFill="#ffffff" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
