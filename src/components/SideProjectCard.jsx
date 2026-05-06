export default function SideProjectCard({ onClick }) {
  return (
    <div
      className={`w-44 bg-red-600 rounded-xl p-3 flex flex-col gap-2 shadow select-none
        ${onClick ? 'cursor-pointer hover:bg-red-500' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <span className="font-bold text-white text-sm">Side Project</span>
        <span className="text-red-300 text-xs">∞</span>
      </div>
      <p className="text-red-100 text-xs leading-snug">Allocate any dice. Score 1 pt per 6 rolled.</p>
      <div className="flex gap-1 flex-wrap text-xs mt-auto pt-1">
        <span className="bg-red-800 text-red-200 rounded px-1.5 py-0.5">= 6 → 1 pt</span>
      </div>
    </div>
  )
}
