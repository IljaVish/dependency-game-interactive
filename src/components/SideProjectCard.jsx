import Card from './Card.jsx'
import DieRequirement from './DieRequirement.jsx'

export default function SideProjectCard({ onClick }) {
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
      <div className="flex items-center gap-2 mt-auto pt-1">
        <DieRequirement label="=6" bgColor="#7f1d1d" textColor="#fca5a5" />
        <span className="text-red-200 text-xs">→ 1 pt each</span>
      </div>
    </Card>
  )
}
