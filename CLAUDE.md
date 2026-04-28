# Dependency Game — Interactive

## What this project is
A browser-based multiplayer version of the Dependency Game, a serious learning 
game about team dependencies originally designed as a physical card and dice game 
by Ilja Vishnevski.

The game helps teams experience the dynamics of cross-team dependencies, 
collaboration, and prioritisation in a safe, playful environment.

## Game mechanics (read carefully before building anything)
- 2–6 players, each represented by a unique dice colour
- Each player has 5 dice of their colour
- Game runs for 8–12 rounds ("months of work")
- Each round has 4 phases: Set → Plan → Work → Score

### Cards
- **Project cards**: Require specific dice values from multiple colours to complete. 
  Players cannot own a project that uses their own colour — collaboration is mandatory.
  Some projects are "urgent": they incur a -1 penalty per round until delivered.
- **Side project cards**: Worth 1 point per 6 rolled with allocated dice.
- **Training cards**: Grant permanent new capabilities once completed with own-colour dice only.

### Training card capabilities
- Support any colour: use your dice as if they were a different colour
- Set one die without rolling
- Reroll two dice once per round

### Key rules
- Dice must be allocated to cards BEFORE rolling — no reallocation after rolling
- Training cards can only be completed with own-colour dice
- Locked dice on unfinished projects cannot be reallocated
- Urgent projects: penalty applies each round from draw until delivery (inclusive)

## Tech stack
- React (frontend framework)
- No backend initially — browser-based, single session
- Plain CSS or Tailwind for styling

## Project goals for v1
1. Players can join a session and are assigned a dice colour
2. Cards are displayed in a shared marketplace view
3. Players allocate dice to cards in the Plan phase
4. Dice are rolled and results calculated automatically in the Work phase
5. Score is tracked per round on a scoreboard
6. A facilitator can control round progression

## How to work in this project
- Always follow the Set → Plan → Work → Score round structure in any implementation
- Keep game logic (rules) separate from UI components
- Prefer simple and readable code over clever code — this project is also a learning tool
- Ask before making assumptions about game rules — the rules are precise