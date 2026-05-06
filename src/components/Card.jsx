// Shared card shell — all card types use this to guarantee identical dimensions.
export default function Card({ className = '', onClick, children }) {
  return (
    <div
      className={`w-56 h-40 rounded-2xl shadow-lg p-4 flex flex-col select-none overflow-hidden ${className} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
