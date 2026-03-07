import { whiteboardService } from '../../services/whiteboardService.js';
import { roomJoinSchema, cursorMoveSchema, safeParse } from '../validation/schemas.js';

const COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#06b6d4','#6366f1','#a855f7','#ec4899',
];
const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

export const registerRoomHandlers = (io, socket) => {
  let currentRoomId = null;

  socket.on('room:join', (raw) => {
    const data = safeParse(roomJoinSchema, raw, 'room:join');
    if (!data) {
      // Schema failure: UUID format wrong, or username invalid
      socket.emit('room:error', {
        code:    'INVALID_PAYLOAD',
        message: 'Invalid room data.',
      });
      return;
    }

    const { roomId, username } = data;

    // ── Existence gate ────────────────────────────────────────────────────────
    //
    // This is the critical security check.
    // whiteboardService.addUser() returns null if the room was never created
    // via POST /api/rooms. A valid UUID format is necessary but not sufficient
    // to join — the room must have been explicitly created server-side first.
    //
    // This eliminates the ID enumeration attack:
    //   Old: room:join { roomId: "GUESS" } → server auto-creates room → attacker inside
    //   New: room:join { roomId: "<uuid>" } → getRoom() → null → room:error → rejected
    //
    // We emit the same error code for "never existed" and "expired / GC'd"
    // to avoid leaking information about whether a room ever existed.
    // ──────────────────────────────────────────────────────────────────────────

    if (currentRoomId) {
      socket.leave(currentRoomId);
      whiteboardService.removeUser(currentRoomId, socket.id);
      io.to(currentRoomId).emit('room:user_left', {
        userId: socket.id,
        users:  whiteboardService.getRoomUsers(currentRoomId),
      });
    }

    const user = {
      id:       socket.id,
      username,
      color:    pickColor(),
      joinedAt: new Date().toISOString(),
    };

    // addUser() returns null if the room does not exist
    const room = whiteboardService.addUser(roomId, user);
    if (!room) {
      socket.emit('room:error', {
        code:    'ROOM_NOT_FOUND',
        message: 'Room not found.',
      });
      return;
    }

    currentRoomId = roomId;
    socket.join(roomId);

    socket.emit('room:synced', {
      strokes: whiteboardService.getStrokes(roomId),
      users:   whiteboardService.getRoomUsers(roomId),
      self:    user,
      history: whiteboardService.getHistoryState(roomId),
    });

    socket.to(roomId).emit('room:user_joined', {
      user,
      users: whiteboardService.getRoomUsers(roomId),
    });
  });

  socket.on('cursor:move', (raw) => {
    if (!currentRoomId) return;
    const pos = safeParse(cursorMoveSchema, raw, 'cursor:move');
    if (!pos) return;
    socket.to(currentRoomId).emit('cursor:move', {
      userId: socket.id, x: pos.x, y: pos.y,
    });
  });

  const doLeave = () => {
    if (!currentRoomId) return;
    whiteboardService.removeUser(currentRoomId, socket.id);
    io.to(currentRoomId).emit('room:user_left', {
      userId: socket.id,
      users:  whiteboardService.getRoomUsers(currentRoomId),
    });
    currentRoomId = null;
  };

  socket.on('room:leave', doLeave);
  socket.on('disconnect', doLeave);
};