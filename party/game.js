import { gameReducer, createInitialState } from '../src/game/engine.js'
import { COLOUR_ORDER } from '../src/data/colours.js'

export default class GameServer {
  constructor(party) {
    this.party = party
    this.lobby = []   // [{ connId, name, colour, role, token }]  role: 'player' | 'facilitator'
    this.gameState = null
  }

  onConnect(conn) {
    if (this.gameState) {
      conn.send(JSON.stringify({ type: 'state', state: this.gameState }))
    } else {
      conn.send(JSON.stringify({ type: 'lobby', players: this.lobby }))
    }
  }

  onMessage(message, sender) {
    const msg = JSON.parse(message)

    switch (msg.type) {
      case 'join': {
        const { name, role, token } = msg

        // Reconnect: same browser-tab token already in lobby
        const existing = token ? this.lobby.find(p => p.token === token) : null
        if (existing) {
          existing.connId = sender.id
          existing.name = name
          const playerIndex = this.lobby.filter(p => p.role === 'player').indexOf(existing)
          sender.send(JSON.stringify({
            type: 'joined',
            playerIndex: role === 'facilitator' ? -1 : playerIndex,
            roomCode: this.party.id,
          }))
          if (this.gameState) {
            sender.send(JSON.stringify({ type: 'state', state: this.gameState }))
          } else {
            this.party.broadcast(JSON.stringify({ type: 'lobby', players: this.lobby }))
          }
          return
        }

        // Reject new joins (not reconnects) after game has started
        if (this.gameState) {
          sender.send(JSON.stringify({ type: 'error', message: 'Game already in progress' }))
          return
        }

        if (role === 'facilitator') {
          this.lobby.push({ connId: sender.id, name, role: 'facilitator', token })
          sender.send(JSON.stringify({ type: 'joined', playerIndex: -1, roomCode: this.party.id }))
        } else {
          const playerCount = this.lobby.filter(p => p.role === 'player').length
          if (playerCount >= 6) {
            sender.send(JSON.stringify({ type: 'error', message: 'Room is full (6 players max)' }))
            return
          }
          const colour = COLOUR_ORDER[playerCount]
          this.lobby.push({ connId: sender.id, name, colour, role: 'player', token })
          sender.send(JSON.stringify({
            type: 'joined',
            playerIndex: playerCount,
            roomCode: this.party.id,
          }))
        }

        this.party.broadcast(JSON.stringify({ type: 'lobby', players: this.lobby }))
        break
      }

      case 'start': {
        const senderEntry = this.lobby.find(p => p.connId === sender.id)
        if (!senderEntry || senderEntry.role !== 'facilitator') {
          sender.send(JSON.stringify({ type: 'error', message: 'Only facilitators can start the game' }))
          return
        }
        const playerEntries = this.lobby.filter(p => p.role === 'player')
        if (playerEntries.length < 4) {
          sender.send(JSON.stringify({ type: 'error', message: 'Need at least 4 players to start' }))
          return
        }
        const playerDefs = playerEntries.map((p, i) => ({
          id: `p${i + 1}`,
          name: p.name,
          colour: p.colour,
        }))
        this.gameState = createInitialState({ playerDefs, totalRounds: 12 })
        this.party.broadcast(JSON.stringify({ type: 'state', state: this.gameState }))
        break
      }

      case 'dispatch': {
        if (!this.gameState) return
        const senderEntry = this.lobby.find(p => p.connId === sender.id)
        if (!senderEntry || senderEntry.role !== 'player') return

        this.gameState = gameReducer(this.gameState, msg.action)

        this.party.broadcast(JSON.stringify({ type: 'state', state: this.gameState }))
        break
      }
    }
  }

  onClose(conn) {
    // Keep lobby entry — player can reconnect by token
    this.party.broadcast(JSON.stringify({ type: 'lobby', players: this.lobby }))
  }
}
