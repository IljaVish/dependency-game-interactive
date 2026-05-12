import DieFace from './DieFace.jsx'
import Card from './Card.jsx'
import DieRequirement from './DieRequirement.jsx'
import { COLOURS } from '../data/colours.js'
import { TRAINING_DEFINITIONS } from '../data/cards.js'
import { assignLockedToSlots } from '../game/rules.js'

export default function TrainingCard({
  trainingKey, copies = 3, onClick,
  allocatedDice = [], diceColour = null,
  onStagingDieClick = null, reworkDieIds = [], settingDieId = null,
}) {
  const def        = TRAINING_DEFINITIONS[trainingKey]
  const colourHex  = diceColour ? COLOURS[diceColour].hex : '#6b7280'
  const pipFill    = diceColour === 'yellow' ? '#1f2937' : '#ffffff'

  const lockedDice    = allocatedDice.filter(d => d.locked)
  const stagingDice   = allocatedDice.filter(d => !d.locked)
  const slotCount     = def.slots ? def.slots.length : def.requiredCount
  const slotAssigned  = assignLockedToSlots(def, lockedDice)

  return (
    <Card
      className={`bg-cyan-700 ${onClick ? 'hover:bg-cyan-600' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <span className="font-bold text-white text-sm">{def.label}</span>
        {copies !== null && <span className="text-cyan-300 text-xs">×{copies}</span>}
      </div>
      <p className="text-cyan-100 text-xs leading-snug line-clamp-2">{def.ability}</p>

      {/* Staging area — allocated but not yet locked dice */}
      {stagingDice.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-2">
          {stagingDice.map(die => {
            const isReworkSelected = reworkDieIds.includes(die.id)
            const isSetSelected    = settingDieId === die.id
            const ringClass = isReworkSelected ? ' ring-2 ring-yellow-300'
              : isSetSelected ? ' ring-2 ring-green-400' : ''
            return (
              <div
                key={die.id}
                onClick={onStagingDieClick ? () => onStagingDieClick(die) : undefined}
                className={onStagingDieClick ? 'cursor-pointer' : undefined}
              >
                <DieFace value={die.value} className={`w-6 h-6${ringClass}`} bgColor={colourHex} pipFill={pipFill} />
              </div>
            )
          })}
        </div>
      )}

      {/* Slot row — locked dice replace requirement indicators when matched */}
      <div className="flex gap-1 flex-wrap mt-auto pt-1">
        {Array.from({ length: slotCount }, (_, i) => {
          const lockedDie = slotAssigned[i]
          if (lockedDie) {
            return <DieFace key={i} value={lockedDie.value} className="w-7 h-7" bgColor="#374151" pipFill="#ffffff" />
          }
          const minVal = def.slots ? def.slots[i] : def.requiredMin
          const label  = minVal === 6 ? '=6' : `≥${minVal}`
          return <DieRequirement key={i} label={label} bgColor="#164e63" textColor="#a5f3fc" className="w-7 h-7" />
        })}
      </div>
    </Card>
  )
}
