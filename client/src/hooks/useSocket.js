import { useEffect, useRef, useCallback } from 'react';
import { connectSocket, getSocket } from '@/lib/socket';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';
import {
  sanitizeStroke,
  sanitizeStrokeArray,
  sanitizeCursor,
  sanitizeUsers,
  sanitizeHistoryState,
} from '@/lib/sanitize';

/**
 * Manages all Socket.io events.
 *
 * Every incoming payload is sanitized before touching the store or canvas.
 * History state (canUndo/canRedo) is driven exclusively by `history:state`
 * events broadcast to the whole room — there is no local optimistic state.
 */
export const useSocket = (canvasRendererRef) => {
  const {
    roomId, username,
    setConnectionStatus, setSelfUser, setUsers,
    updateCursor, removeCursor,
    setHistoryState,
  } = useWhiteboardStore();

  const socketRef = useRef(null);

  // ── One-time connection ─────────────────────────────────────────────────────
  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    socket.on('connect',       () => setConnectionStatus('connected'));
    socket.on('disconnect',    () => setConnectionStatus('idle'));
    socket.on('connect_error', () => setConnectionStatus('error'));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
    };
  }, []);

  // ── Room join ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    setConnectionStatus('connecting');
    socket.emit('room:join', { roomId, username });

    // ── Presence ──────────────────────────────────────────────────────────────
    socket.on('room:synced', (raw) => {
      if (!raw || typeof raw !== 'object') return;

      const strokes = sanitizeStrokeArray(raw.strokes);
      const users   = sanitizeUsers(raw.users);
      const self    = raw.self && typeof raw.self === 'object'
        ? { id: String(raw.self.id || ''), username: String(raw.self.username || 'Guest').slice(0, 32), color: raw.self.color || '#888', joinedAt: raw.self.joinedAt || '' }
        : null;
      const history = sanitizeHistoryState(raw.history);

      setSelfUser(self);
      setUsers(users);
      setHistoryState(history);
      canvasRendererRef.current?.replayStrokes(strokes);
      setConnectionStatus('connected');
    });

    socket.on('room:user_joined', (raw) => {
      if (!raw?.users) return;
      setUsers(sanitizeUsers(raw.users));
    });

    socket.on('room:user_left', (raw) => {
      if (!raw) return;
      if (raw.users)  setUsers(sanitizeUsers(raw.users));
      if (raw.userId) removeCursor(String(raw.userId));
    });

    socket.on('room:error', (raw) => {
      if (typeof raw?.message === 'string') console.warn('[room:error]', raw.message);
    });

    // ── Drawing — live stream ─────────────────────────────────────────────────
    socket.on('draw:start', (raw) => {
      if (!raw || typeof raw !== 'object') return;
      canvasRendererRef.current?.remoteDrawStart(raw);
    });

    socket.on('draw:move', (raw) => {
      if (!raw || typeof raw !== 'object') return;
      canvasRendererRef.current?.remoteDrawMove(raw);
    });

    socket.on('draw:end', (raw) => {
      const stroke = sanitizeStroke(raw);
      if (!stroke) return;
      canvasRendererRef.current?.remoteDrawEnd(stroke);
    });

    // ── Clear ─────────────────────────────────────────────────────────────────
    socket.on('draw:clear', () => canvasRendererRef.current?.clear());

    // ── Board replay (after undo/redo) ────────────────────────────────────────
    socket.on('board:replay', (raw) => {
      const strokes = sanitizeStrokeArray(raw?.strokes);
      canvasRendererRef.current?.replayStrokes(strokes);
    });

    // ── Shared history state — broadcast to ALL room members ──────────────────
    socket.on('history:state', (raw) => {
      setHistoryState(sanitizeHistoryState(raw));
    });

    // ── Cursors ───────────────────────────────────────────────────────────────
    socket.on('cursor:move', (raw) => {
      const cursor = sanitizeCursor(raw);
      if (cursor) updateCursor(cursor.userId, cursor);
    });

    return () => {
      socket.emit('room:leave');
      [
        'room:synced','room:user_joined','room:user_left','room:error',
        'draw:start','draw:move','draw:end','draw:clear',
        'board:replay','history:state','cursor:move',
      ].forEach((e) => socket.off(e));
    };
  }, [roomId]);

  const emit     = useCallback((event, data) => socketRef.current?.emit(event, data), []);
  const emitUndo = useCallback(() => socketRef.current?.emit('draw:undo'), []);
  const emitRedo = useCallback(() => socketRef.current?.emit('draw:redo'), []);

  return { emit, emitUndo, emitRedo };
};