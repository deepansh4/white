import { useEffect, useRef, useCallback } from 'react';
import { connectSocket, getSocket } from '@/lib/socket';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';
import {
  sanitizeStroke,
  sanitizeStrokeArray,
  sanitizeCursor,
  sanitizeUsers,
  sanitizeHistoryState,
  sanitizeViewport,
} from '@/lib/sanitize';

// applyViewportRef — created in WhiteboardPage, passed here.
// When viewport:change arrives, we call applyViewportRef.current(vp) directly.
// Canvas sets applyViewportRef.current = commit on every render so it is always
// the latest function. This is a direct synchronous call — no React state,
// no batching, no useEffect delay. The DOM updates immediately.
export const useSocket = (canvasRendererRef, applyViewportRef) => {
  const {
    roomId, username,
    setConnectionStatus, setSelfUser, setUsers,
    updateCursor, removeCursor,
    setHistoryState, setRoomError,
  } = useWhiteboardStore();

  const socketRef = useRef(null);

  // ── One-time connection ──────────────────────────────────────────────────────
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

  // ── Room join ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    setConnectionStatus('connecting');
    socket.emit('room:join', { roomId, username });

    socket.on('room:synced', (raw) => {
      if (!raw || typeof raw !== 'object') return;
      const strokes = sanitizeStrokeArray(raw.strokes);
      const users   = sanitizeUsers(raw.users);
      const history = sanitizeHistoryState(raw.history);
      const self = raw.self && typeof raw.self === 'object' ? {
        id:       String(raw.self.id       || '').slice(0, 64),
        username: String(raw.self.username || 'Guest').replace(/[<>"'&]/g, '').slice(0, 32),
        color:    typeof raw.self.color === 'string' ? raw.self.color : '#888',
        joinedAt: typeof raw.self.joinedAt === 'string' ? raw.self.joinedAt : '',
      } : null;
      setSelfUser(self);
      setUsers(users);
      setHistoryState(history);
      canvasRendererRef.current?.replayStrokes(strokes);
      setConnectionStatus('connected');
    });

    socket.on('room:user_joined', (raw) => {
      if (raw?.users) setUsers(sanitizeUsers(raw.users));
    });

    socket.on('room:user_left', (raw) => {
      if (!raw) return;
      if (raw.users)  setUsers(sanitizeUsers(raw.users));
      if (raw.userId) removeCursor(String(raw.userId).slice(0, 64));
    });

    socket.on('room:error', (raw) => {
      if (!raw || typeof raw !== 'object') return;
      const code = typeof raw.code === 'string' ? raw.code : 'UNKNOWN';
      if (code === 'ROOM_NOT_FOUND') {
        setRoomError('ROOM_NOT_FOUND');
      } else if (import.meta.env.DEV && typeof raw.message === 'string') {
        console.warn('[room:error]', code, raw.message.slice(0, 200));
      }
    });

    socket.on('draw:start', (raw) => {
      if (raw && typeof raw === 'object') canvasRendererRef.current?.remoteDrawStart(raw);
    });
    socket.on('draw:move', (raw) => {
      if (raw && typeof raw === 'object') canvasRendererRef.current?.remoteDrawMove(raw);
    });
    socket.on('draw:end', (raw) => {
      const stroke = sanitizeStroke(raw);
      if (stroke) canvasRendererRef.current?.remoteDrawEnd(stroke);
    });
    socket.on('draw:clear', () => canvasRendererRef.current?.clear());
    socket.on('board:replay', (raw) => {
      canvasRendererRef.current?.replayStrokes(sanitizeStrokeArray(raw?.strokes));
    });
    socket.on('history:state', (raw) => {
      setHistoryState(sanitizeHistoryState(raw));
    });
    socket.on('cursor:move', (raw) => {
      const cursor = sanitizeCursor(raw);
      if (cursor) updateCursor(cursor.userId, cursor);
    });

    // ── INCOMING viewport sync ───────────────────────────────────────────────
    // Direct synchronous call — no React state involved.
    // applyViewportRef.current is set by Canvas on every render to its commit()
    // function. Calling it here immediately applies the transform to the DOM.
    socket.on('viewport:change', (raw) => {
      const vp = sanitizeViewport(raw);
      if (vp && applyViewportRef?.current) {
        applyViewportRef.current(vp);
      }
    });

    return () => {
      socket.emit('room:leave');
      [
        'room:synced', 'room:user_joined', 'room:user_left', 'room:error',
        'draw:start', 'draw:move', 'draw:end', 'draw:clear',
        'board:replay', 'history:state', 'cursor:move', 'viewport:change',
      ].forEach((e) => socket.off(e));
    };
  }, [roomId]);

  const emit     = useCallback((event, data) => socketRef.current?.emit(event, data), []);
  const emitUndo = useCallback(() => socketRef.current?.emit('draw:undo'), []);
  const emitRedo = useCallback(() => socketRef.current?.emit('draw:redo'), []);

  return { emit, emitUndo, emitRedo };
};