import { TRAINING_DEFINITIONS } from '../data/cards.js'

export default function TrainingCard({ trainingKey, copies = 3 }) {
  const def = TRAINING_DEFINITIONS[trainingKey]

  const slots = def.slots
    ? def.slots.map((min, i) => <span key={i} className="bg-cyan-900 text-cyan-200 rounded px-1.5 py-0.5">≥{min}</span>)
    : Array.from({ length: def.requiredCount }, (_, i) => (
        <span key={i} className="bg-cyan-900 text-cyan-200 rounded px-1.5 py-0.5">≥{def.requiredMin}</span>
      ))

  return (
    <div className="w-44 bg-cyan-700 rounded-xl p-3 flex flex-col gap-2 shadow select-none">
      <div className="flex items-start justify-between">
        <span className="font-bold text-white text-sm">{def.label}</span>
        <span className="text-cyan-300 text-xs">×{copies}</span>
      </div>
      <p className="text-cyan-100 text-xs leading-snug">{def.ability}</p>
      <div className="flex gap-1 flex-wrap text-xs mt-auto pt-1">
        {slots}
      </div>
    </div>
  )
}
