// A die-sized square showing a required value — same dimensions as DieFace.
export default function DieRequirement({ label, bgColor = '#e5e7eb', textColor = '#1f2937' }) {
  return (
    <div
      className="w-9 h-9 rounded-lg border-2 border-black/20 shadow-sm flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {label}
    </div>
  )
}
