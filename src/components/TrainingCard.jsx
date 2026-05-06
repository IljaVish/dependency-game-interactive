import Card from './Card.jsx'
import DieRequirement from './DieRequirement.jsx'
import { TRAINING_DEFINITIONS } from '../data/cards.js'

export default function TrainingCard({ trainingKey, copies = 3, onClick }) {
  const def = TRAINING_DEFINITIONS[trainingKey]

  const slots = def.slots
    ? def.slots.map((min, i) => (
        <DieRequirement key={i} label={min === 6 ? '=6' : `≥${min}`} bgColor="#164e63" textColor="#a5f3fc" />
      ))
    : Array.from({ length: def.requiredCount }, (_, i) => (
        <DieRequirement key={i} label={`≥${def.requiredMin}`} bgColor="#164e63" textColor="#a5f3fc" />
      ))

  return (
    <Card
      className={`bg-cyan-700 ${onClick ? 'hover:bg-cyan-600' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <span className="font-bold text-white text-sm">{def.label}</span>
        {copies !== null && <span className="text-cyan-300 text-xs">×{copies}</span>}
      </div>
      <p className="text-cyan-100 text-xs leading-snug line-clamp-3">{def.ability}</p>
      <div className="flex gap-1.5 flex-wrap mt-auto pt-1">
        {slots}
      </div>
    </Card>
  )
}
