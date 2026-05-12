import DieFace from './DieFace.jsx'
import Card from './Card.jsx'
import { COLOURS } from '../data/colours.js'

const BURST_PTS = Array.from({ length: 24 }, (_, i) => {
  const angle = (i * Math.PI) / 12 - Math.PI / 2
  const r = i % 2 === 0 ? 46 : 32
  return `${(50 + r * Math.cos(angle)).toFixed(1)},${(50 + r * Math.sin(angle)).toFixed(1)}`
}).join(' ')

function Starburst({ lines, fill }) {
  const yMid = lines.length === 1 ? 57 : 47
  return (
    <svg width="56" height="56" viewBox="0 0 100 100" className="flex-shrink-0">
      <polygon points={BURST_PTS} fill={fill} />
      {lines.map((line, i) => (
        <text key={i} x="50" y={yMid + i * 18} textAnchor="middle"
          fill="white" fontSize="16" fontWeight="bold" fontFamily="system-ui, sans-serif">
          {line}
        </text>
      ))}
    </svg>
  )
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-400 flex-shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

// allocatedOwnerDice / allocatedDepDice: die objects from engine state.
// Locked dice (matched in a prior round) go into their slot; others go to staging.
export default function ProjectCard({
  card, onClick,
  allocatedOwnerDice = [], allocatedDepDice = [],
  ownerColour = null,
  onOwnerStagingDieClick = null, reworkDieIds = [], settingDieId = null,
}) {
  const depColour    = COLOURS[card.depColour]
  const depPipFill   = card.depColour === 'yellow' ? '#1f2937' : '#ffffff'
  const ownerHex     = ownerColour ? COLOURS[ownerColour].hex : '#9ca3af'
  const ownerPipFill = ownerColour === 'yellow' ? '#1f2937' : '#ffffff'

  const lockedOwner  = allocatedOwnerDice.filter(d => d.locked)
  const stagingOwner = allocatedOwnerDice.filter(d => !d.locked)
  const lockedDep    = allocatedDepDice.filter(d => d.locked)
  const stagingDep   = allocatedDepDice.filter(d => !d.locked)

  const hasStaging = stagingOwner.length > 0 || stagingDep.length > 0

  return (
    <Card
      className={`bg-white ${onClick ? 'border border-blue-400 hover:shadow-blue-200 hover:shadow-xl' : 'border border-gray-200'}`}
      onClick={onClick}
    >
      {/* Slot row — requirement indicators, replaced by locked dice when matched */}
      <div className="flex items-center">
        <div className="flex gap-1">
          {card.ownerDice.map((req, i) => {
            const die = lockedOwner[i]
            return die
              ? <DieFace key={i} value={die.value} className="w-7 h-7" bgColor="#374151" pipFill="#ffffff" />
              : <DieFace key={i} value={req} className="w-7 h-7" bgColor="#e5e7eb" pipFill="#1f2937" />
          })}
        </div>
        <div className="flex-1 flex justify-center"><Arrow /></div>
        <div className="flex gap-1">
          {card.depDice.map((req, i) => {
            const die = lockedDep[i]
            return die
              ? <DieFace key={i} value={die.value} className="w-7 h-7" bgColor="#374151" pipFill="#ffffff" />
              : <DieFace key={i} value={req} className="w-7 h-7" bgColor={depColour.hex} pipFill={depPipFill} />
          })}
        </div>
      </div>

      {/* Staging area — allocated but not yet matched dice sit here */}
      {hasStaging && (
        <div className="flex gap-1 flex-wrap mt-2">
          {stagingOwner.map(die => {
            const isReworkSelected = reworkDieIds.includes(die.id)
            const isSetSelected    = settingDieId === die.id
            const ringClass = isReworkSelected ? ' ring-2 ring-yellow-300'
              : isSetSelected ? ' ring-2 ring-green-400' : ''
            return (
              <div
                key={die.id}
                onClick={onOwnerStagingDieClick ? () => onOwnerStagingDieClick(die) : undefined}
                className={onOwnerStagingDieClick ? 'cursor-pointer' : undefined}
              >
                <DieFace value={die.value} className={`w-6 h-6${ringClass}`} bgColor={ownerHex} pipFill={ownerPipFill} />
              </div>
            )
          })}
          {stagingDep.map(die => (
            <DieFace key={die.id} value={die.value} className="w-6 h-6" bgColor={depColour.hex} pipFill={depPipFill} />
          ))}
        </div>
      )}

      {/* Badge row */}
      <div className="flex items-center mt-auto">
        {card.urgentPenalty > 0
          ? <Starburst lines={[`-${card.urgentPenalty}P`, '/month']} fill="#ef4444" />
          : <div className="w-14 h-14" />}
        <div className="flex-1" />
        <Starburst lines={[`${card.points}`, 'Pts']} fill="#7c3aed" />
      </div>
    </Card>
  )
}
