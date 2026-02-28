import { config }            from '../../config/env.js';
import { whiteboardService } from '../../services/whiteboardService.js';
import {
  drawStartSchema, drawMoveSchema, drawEndSchema,
  safeParse,
} from '../validation/schemas.js';

/**
 * Drawing events + global collaborative undo/redo.
 * No rate limiting on any drawing events — Zod validation is the guard.
 */
export const registerDrawingHandlers = (io, socket, getRoomId) => {

  const broadcastReplay = (roomId, strokes) =>
    io.to(roomId).emit('board:replay', { strokes });

  const broadcastHistoryState = (roomId, extra = {}) =>
    io.to(roomId).emit('history:state', {
      ...whiteboardService.getHistoryState(roomId),
      ...extra,
    });

  const getAttribution = (roomId) => {
    const users = whiteboardService.getRoomUsers(roomId);
    const user  = users.find((u) => u.id === socket.id);
    return { userId: socket.id, username: user?.username ?? 'Unknown' };
  };

  // ── draw:start ────────────────────────────────────────────────────────────────
  socket.on('draw:start', (data) => {
    const roomId = getRoomId();
    if (!roomId) return;
    const parsed = safeParse(drawStartSchema, data, 'draw:start');
    if (!parsed) return;
    socket.to(roomId).emit('draw:start', { ...parsed, userId: socket.id });
  });

  // ── draw:move ─────────────────────────────────────────────────────────────────
  socket.on('draw:move', (data) => {
    const roomId = getRoomId();
    if (!roomId) return;
    const parsed = safeParse(drawMoveSchema, data, 'draw:move');
    if (!parsed) return;
    socket.to(roomId).emit('draw:move', { ...parsed, userId: socket.id });
  });

  // ── draw:end ──────────────────────────────────────────────────────────────────
  socket.on('draw:end', (raw) => {
    const roomId = getRoomId();
    if (!roomId) return;
    const parsed = safeParse(drawEndSchema, raw, 'draw:end');
    if (!parsed) return;

    // Deduplication — blocks replay attacks
    if (whiteboardService.getStrokes(roomId).some((s) => s.id === parsed.id)) {
      if (config.isDev) console.warn(`[draw:end] duplicate id "${parsed.id}" — dropped`);
      return;
    }

    const attribution = getAttribution(roomId);
    const saved = whiteboardService.addStroke(
      roomId,
      { ...parsed, userId: socket.id, timestamp: new Date().toISOString() },
      attribution,
    );

    socket.to(roomId).emit('draw:end', saved);
    broadcastHistoryState(roomId);
  });

  // ── draw:clear ────────────────────────────────────────────────────────────────
  socket.on('draw:clear', () => {
    const roomId = getRoomId();
    if (!roomId) return;
    const attribution = getAttribution(roomId);
    whiteboardService.clearRoom(roomId, attribution);
    io.to(roomId).emit('draw:clear');
    broadcastHistoryState(roomId);
  });

  // ── draw:undo ─────────────────────────────────────────────────────────────────
  socket.on('draw:undo', () => {
    const roomId = getRoomId();
    if (!roomId) return;
    const result = whiteboardService.undo(roomId, getAttribution(roomId));
    if (!result) return;
    broadcastReplay(roomId, result.strokes);
    io.to(roomId).emit('history:state', {
      canUndo: result.canUndo, canRedo: result.canRedo, lastAction: result.lastAction,
    });
  });

  // ── draw:redo ─────────────────────────────────────────────────────────────────
  socket.on('draw:redo', () => {
    const roomId = getRoomId();
    if (!roomId) return;
    const result = whiteboardService.redo(roomId, getAttribution(roomId));
    if (!result) return;
    broadcastReplay(roomId, result.strokes);
    io.to(roomId).emit('history:state', {
      canUndo: result.canUndo, canRedo: result.canRedo, lastAction: result.lastAction,
    });
  });
};