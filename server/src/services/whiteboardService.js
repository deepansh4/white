/**
 * WhiteboardService — in-memory per-room state.
 *
 * Designed to be replaced with a DB-backed implementation (MongoDB, Redis)
 * without touching any socket handler. The interface contract is:
 *
 *   addStroke(roomId, stroke)    → stroke
 *   clearRoom(roomId)            → void
 *   undo(roomId)                 → { strokes, canUndo, canRedo } | null
 *   redo(roomId)                 → { strokes, canUndo, canRedo } | null
 *   getHistoryState(roomId)      → { canUndo, canRedo }
 *   getStrokes(roomId)           → stroke[]
 *   addUser / removeUser / getRoomUsers / listRooms
 *
 * ── Collaborative History Model ────────────────────────────────────────────────
 *
 * Every room owns ONE shared actionHistory (undo stack) and ONE redoStack.
 * This means ANY connected user can undo/redo actions by ANY other user —
 * the stack is global, not per-user.
 *
 * Action types:
 *   { type: 'stroke', stroke }              — a completed drawing stroke
 *   { type: 'clear',  previousStrokes: [] } — a board-clear (with snapshot)
 *
 * Properties:
 *   ✓ Order-preserving  — actions are always replayed in commit order
 *   ✓ Conflict-safe     — Node.js single-thread means no concurrent mutations
 *   ✓ Clear is undoable — snapshot is taken before every clear
 *   ✓ Bounded memory    — historyLimit caps stack depth per room
 *
 * ── Scalability Notes ─────────────────────────────────────────────────────────
 *
 * To scale horizontally (multiple Node processes / servers):
 *   1. Replace `rooms` Map with Redis hash per roomId
 *   2. Use Pub/Sub (Redis or NATS) for cross-process board:replay broadcasts
 *   3. Use socket.io-redis adapter for Socket.io room membership
 *   All handler code remains unchanged.
 */

import { config } from '../config/env.js';

/** @type {Map<string, Room>} */
const rooms = new Map();

/** @returns {Room} */
const createRoom = (roomId) => ({
  id:            roomId,
  strokes:       [],         // current visible strokes
  actionHistory: [],         // undo stack — newest last
  redoStack:     [],         // redo stack — newest last
  users:         new Map(),  // Map<socketId, UserObject>
  createdAt:     new Date().toISOString(),
  updatedAt:     new Date().toISOString(),
});

const touch = (room) => {
  room.updatedAt = new Date().toISOString();
  return room;
};

/**
 * Trim actionHistory so long-running rooms don't grow unboundedly.
 * Oldest actions are dropped first (FIFO trim from front).
 */
const trimHistory = (room) => {
  const limit = config.historyLimit;
  if (room.actionHistory.length > limit) {
    room.actionHistory.splice(0, room.actionHistory.length - limit);
  }
};

/** Build the result object returned by undo() and redo(). */
const historyResult = (room) => ({
  strokes:  [...room.strokes],
  canUndo:  room.actionHistory.length > 0,
  canRedo:  room.redoStack.length > 0,
});

export const whiteboardService = {

  // ── Room lifecycle ──────────────────────────────────────────────────────────

  getRoom(roomId) {
    return rooms.get(roomId) ?? null;
  },

  getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) rooms.set(roomId, createRoom(roomId));
    return rooms.get(roomId);
  },

  // ── Stroke mutations ────────────────────────────────────────────────────────

  addStroke(roomId, stroke) {
    const room = this.getOrCreateRoom(roomId);
    room.strokes.push(stroke);
    room.actionHistory.push({ type: 'stroke', stroke });
    room.redoStack = [];   // new action always clears redo stack
    trimHistory(room);
    touch(room);
    return stroke;
  },

  // ── Clear (undoable snapshot action) ───────────────────────────────────────

  clearRoom(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return;

    // Snapshot the current board before wiping — enables undoing the clear
    room.actionHistory.push({ type: 'clear', previousStrokes: [...room.strokes] });
    room.redoStack = [];
    room.strokes   = [];
    trimHistory(room);
    touch(room);
  },

  // ── Undo ────────────────────────────────────────────────────────────────────

  undo(roomId) {
    const room = this.getRoom(roomId);
    if (!room || room.actionHistory.length === 0) return null;

    const action = room.actionHistory.pop();
    room.redoStack.push(action);

    if (action.type === 'stroke') {
      // Remove the most recent occurrence of this stroke (safe for deduped IDs)
      const idx = [...room.strokes].map((s) => s.id).lastIndexOf(action.stroke.id);
      if (idx !== -1) room.strokes.splice(idx, 1);
    } else if (action.type === 'clear') {
      // Restore the board to its pre-clear state
      room.strokes = [...action.previousStrokes];
    }

    touch(room);
    return historyResult(room);
  },

  // ── Redo ────────────────────────────────────────────────────────────────────

  redo(roomId) {
    const room = this.getRoom(roomId);
    if (!room || room.redoStack.length === 0) return null;

    const action = room.redoStack.pop();
    room.actionHistory.push(action);
    trimHistory(room);

    if (action.type === 'stroke') {
      room.strokes.push(action.stroke);
    } else if (action.type === 'clear') {
      room.strokes = [];
    }

    touch(room);
    return historyResult(room);
  },

  // ── History state query ─────────────────────────────────────────────────────

  /** Returns canUndo / canRedo for toolbar button state. */
  getHistoryState(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return { canUndo: false, canRedo: false };
    return { canUndo: room.actionHistory.length > 0, canRedo: room.redoStack.length > 0 };
  },

  // ── Stroke queries ──────────────────────────────────────────────────────────

  getStrokes(roomId) {
    const room = this.getRoom(roomId);
    return room ? [...room.strokes] : [];
  },

  // ── User management ─────────────────────────────────────────────────────────

  addUser(roomId, user) {
    const room = this.getOrCreateRoom(roomId);
    room.users.set(user.id, user);
    touch(room);
    return room;
  },

  removeUser(roomId, userId) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    room.users.delete(userId);
    touch(room);
    // Garbage-collect empty rooms after a grace period
    if (room.users.size === 0) {
      setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && r.users.size === 0) rooms.delete(roomId);
      }, 30_000);
    }
    return room;
  },

  getRoomUsers(roomId) {
    const room = this.getRoom(roomId);
    return room ? Array.from(room.users.values()) : [];
  },

  // ── Room listing (admin / health) ───────────────────────────────────────────

  listRooms() {
    return Array.from(rooms.values()).map((r) => ({
      id:          r.id,
      userCount:   r.users.size,
      strokeCount: r.strokes.length,
      historyDepth: r.actionHistory.length,
      redoDepth:    r.redoStack.length,
      createdAt:   r.createdAt,
      updatedAt:   r.updatedAt,
    }));
  },
};