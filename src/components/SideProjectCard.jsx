import DieFace from './DieFace.jsx'
import Card from './Card.jsx'
import DieRequirement from './DieRequirement.jsx'
import { COLOURS } from '../data/colours.js'

export default function SideProjectCard({
  onClick, allocatedDice = [], diceColour = null,
  onStagingDieClick = null, reworkDieIds = [], settingDieId = null,
}) {
  const colourHex = diceColour ? COLOURS[diceColour].hex : '#6b7280'
  const pipFill   = diceColour === 'yellow' ? '#1f2937' : '#ffffff'

  return (
    <Card
      className={`bg-red-600 ${onClick ? 'hover:bg-red-500' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <span className="font-bold text-white text-sm">Side Project</span>
        <span className="text-red-300 text-xs">∞</span>
      </div>
      <p className="text-red-100 text-xs leading-snug">Allocate any dice. Score 1 pt per 6 rolled.</p>

      {/* Staging area — all allocated dice; 6s highlighted after rolling */}
      {allocatedDice.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-2">
          {allocatedDice.map(die => {
            const isReworkSelected = reworkDieIds.includes(die.id)
            const isSetSelected    = settingDieId === die.id
            const ringClass = isReworkSelected ? ' ring-2 ring-yellow-300'
              : isSetSelected ? ' ring-2 ring-green-400'
              : die.value === 6 ? ' ring-2 ring-yellow-300' : ''
            return (
              <div
                key={die.id}
                onClick={onStagingDieClick ? (e) => onStagingDieClick(die, e) : undefined}
                className={onStagingDieClick ? 'cursor-pointer' : undefined}
              >
                <DieFace value={die.value} className={`w-6 h-6${ringClass}`} bgColor={colourHex} pipFill={pipFill} />
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        <DieRequirement label="=6" bgColor="#7f1d1d" textColor="#fca5a5" className="w-7 h-7" />
        <span className="text-red-200 text-xs">→ 1 pt each</span>
      </div>
    </Card>
  )
}
