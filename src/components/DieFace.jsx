const PIPS = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
}

// bgColor: hex string for die background (default white)
// pipFill: hex string for pip color (default dark)
export default function DieFace({ value, className = 'w-12 h-12', bgColor = '#ffffff', pipFill = '#1f2937' }) {
  const pips = PIPS[value] ?? []
  return (
    <div
      className={`${className} rounded-lg border-2 border-black/20 shadow-sm flex items-center justify-center flex-shrink-0`}
      style={{ backgroundColor: bgColor }}
    >
      <svg viewBox="0 0 3 3" className="w-4/5 h-4/5">
        {pips.map(([col, row], i) => (
          <circle key={i} cx={col + 0.5} cy={row + 0.5} r={0.35} fill={pipFill} />
        ))}
      </svg>
    </div>
  )
}
