import ProjectCard from './components/ProjectCard.jsx'
import { PROJECT_CARDS } from './data/cards.js'

// Show all 6 templates for green — covers all combinations of urgency and dep-dice count.
const SAMPLE_CARDS = PROJECT_CARDS.filter(c => c.depColour === 'green')

export default function App() {
  return (
    <div className="min-h-screen bg-gray-800 flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-white text-2xl font-bold tracking-wide">Dependency Game</h1>
      <div className="flex flex-wrap gap-6 justify-center">
        {SAMPLE_CARDS.map(card => (
          <ProjectCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  )
}
