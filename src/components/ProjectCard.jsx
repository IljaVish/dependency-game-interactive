import DieFace from './DieFace.jsx'
import { COLOURS } from '../data/colours.js'

// Pre-computed 12-point starburst polygon (outer r=46, inner r=32).
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
        <text
          key={i}
          x="50"
          y={yMid + i * 18}
          textAnchor="middle"
          fill="white"
          fontSize="16"
          fontWeight="bold"
          fontFamily="system-ui, sans-serif"
        >
          {line}
        </text>
      ))}
    </svg>
  )
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export default function ProjectCard({ card }) {
  const colour = COLOURS[card.depColour]
  const depPipFill = card.depColour === 'yellow' ? '#1f2937' : '#ffffff'

  return (
    <div className="w-56 bg-white rounded-2xl shadow-lg border border-gray-200 select-none p-4 flex flex-col gap-2">

      {/* Dice row: owner left, arrow expands, dep right */}
      <div className="flex items-center">
        <div className="flex gap-2">
          {card.ownerDice.map((v, i) => (
            <DieFace key={i} value={v} bgColor="#e5e7eb" pipFill="#1f2937" />
          ))}
        </div>
        <div className="flex-1 flex justify-center">
          <Arrow />
        </div>
        <div className="flex gap-2">
          {card.depDice.map((v, i) => (
            <DieFace key={i} value={v} bgColor={colour.hex} pipFill={depPipFill} />
          ))}
        </div>
      </div>

      {/* Badge row: urgency under owner dice (left), points under dep dice (right) */}
      <div className="flex items-center">
        {card.urgentPenalty > 0
          ? <Starburst lines={[`-${card.urgentPenalty}P`, '/month']} fill="#ef4444" />
          : <div className="w-14 h-14" />}
        <div className="flex-1" />
        <Starburst lines={[`${card.points}`, 'Pts']} fill="#7c3aed" />
      </div>
    </div>
  )
}
