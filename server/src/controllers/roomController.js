import { randomUUID } from 'crypto';
import { whiteboardService } from '../services/whiteboardService.js';
import { config } from '../config/env.js';

/**
 * Thin REST controllers. All business logic lives in whiteboardService.
 *
 * Error shape is consistent with validateRequest.js and the global handler:
 *   { error: string, requestId?: string }
 *
 * Never expose internal details (stack traces, service internals) here.
 */
export const roomController = {

  /**
   * POST /api/rooms
   *
   * Creates a new room with a cryptographically random UUID v4 identifier.
   * This is the ONLY place room IDs are generated — never on the client.
   *
   * Security properties of crypto.randomUUID():
   *   • 122 bits of entropy (6 bits used for version/variant markers)
   *   • ~5.3 × 10^36 possible values — brute-force is computationally infeasible
   *   • Uses the OS CSPRNG (same source as crypto.getRandomValues in browsers)
   *   • Not guessable, not sequential, not derivable from timestamp or process state
   *
   * Rate limited separately (roomCreateRateLimiter) — tighter than the global
   * HTTP limiter to prevent automated room farming.
   */
  createRoom(req, res) {
    const roomId = randomUUID();         // crypto.randomUUID() — Node 14.17+ built-in
    whiteboardService.createRoom(roomId);

    if (config.isDev) {
      console.log(`[room:create] ${roomId}`);
    }

    // 201 Created — standard for resource creation
    res.status(201).json({ roomId });
  },

  /**
   * GET /api/rooms
   * Lists active rooms. Disabled in production unless ADMIN_TOKEN is set.
   */
  listRooms(req, res) {
    const rooms = whiteboardService.listRooms();
    res.json({ rooms, count: rooms.length });
  },

  /**
   * GET /api/rooms/:roomId
   * Returns public metadata for one room (no strokes, no socket IDs).
   */
  getRoom(req, res) {
    const room = whiteboardService.getRoom(req.params.roomId);

    if (!room) {
      // Return 404 — but do NOT distinguish "never existed" from "expired"
      // Giving different errors for each leaks information to enumerators.
      return res.status(404).json({
        error:     'Room not found.',
        requestId: req.id,
      });
    }

    res.json({
      id:          room.id,
      userCount:   room.users.size,
      strokeCount: room.strokes.length,
      canUndo:     room.actionHistory.length > 0,
      canRedo:     room.redoStack.length > 0,
      createdAt:   room.createdAt,
      updatedAt:   room.updatedAt,
    });
  },
};