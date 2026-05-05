# Dependency Game — Interactive

## What this project is
A browser-based multiplayer version of the Dependency Game, a serious learning 
game about team dependencies originally designed as a physical card and dice game 
by Ilja Vishnevski.

The game helps teams experience the dynamics of cross-team dependencies, 
collaboration, and prioritisation in a safe, playful environment.

## Game mechanics (read carefully before building anything)
- 4–6 players, each represented by a unique dice colour (ideal for 6; playable with 4 or 5; not recommended below 4)
- Each player has 5 dice of their colour
- Game runs for 8–12 rounds ("months of work")
- Each round has 4 phases: Set → Plan → Work → Score

### Cards
- **Project cards**: Require specific dice values from multiple colours to complete. 
  Players cannot own a project that uses their own colour — collaboration is mandatory.
  Some projects are "urgent": they incur a penalty of -1 or -2 points per round from
  the round after drawing until delivery (inclusive).
- **Side project cards**: Worth 1 point per 6 rolled with allocated dice.
- **Training cards**: Grant permanent new capabilities once completed with own-colour dice only.
  Completed trainings are active from the next round onward.

### Training card capabilities and completion conditions
- **Rework**: Reroll two of your dice once per round — complete with 2 own-colour dice showing ≥ 4
- **Support**: Use your dice as if they were a different colour — complete with 3 own-colour dice showing ≥ 4
- **Set**: Set one die to any value without rolling — complete with one die ≥ 6, one die ≥ 5, one die ≥ 4
  (greedy match, hardest slot first; this differs from the physical V1.1 card which required 3 dice ≥ 5)

### Key rules
- Dice must be allocated to cards BEFORE rolling — no reallocation after rolling
- Training cards can only be completed with own-colour dice
- Locked dice on unfinished projects cannot be reallocated
- Urgent projects: penalty applies each round from draw until delivery (inclusive)

## Tech stack
- React 18 + Vite (frontend framework and build tool)
- Tailwind CSS v4 via @tailwindcss/vite plugin
- No backend initially — browser-based, single session, all state in React

## Project goals for v1
1. Players can join a session and are assigned a dice colour
2. Cards are displayed in a shared marketplace view
3. Players allocate dice to cards in the Plan phase
4. Dice are rolled and results calculated automatically in the Work phase
5. Score is tracked per round on a scoreboard
6. A facilitator can control round progression

## Source structure
- `src/game/` — pure game logic (rules.js, engine.js). No React, no side effects.
- `src/data/` — static card and colour definitions (cards.js, colours.js)
- `src/components/` — React UI components
- `simulate.js` — Node.js Monte Carlo simulation for strategy analysis (not part of the game UI)

## How to work in this project
- Always follow the Set → Plan → Work → Score round structure in any implementation
- Keep game logic (rules) separate from UI components
- Prefer simple and readable code over clever code — this project is also a learning tool
- Ask before making assumptions about game rules — the rules are precise