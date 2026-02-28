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
      socket.emit('room:error', { message: 'Invalid room data.' });
      return;
    }
    const { roomId, username } = data;

    if (currentRoomId) {
      socket.leave(currentRoomId);
      whiteboardService.removeUser(currentRoomId, socket.id);
      io.to(currentRoomId).emit('room:user_left', {
        userId: socket.id,
        users:  whiteboardService.getRoomUsers(currentRoomId),
      });
    }

    currentRoomId = roomId;
    socket.join(roomId);

    const user = {
      id:       socket.id,
      username,
      color:    pickColor(),
      joinedAt: new Date().toISOString(),
    };

    whiteboardService.addUser(roomId, user);

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
    socket.to(currentRoomId).emit('cursor:move', { userId: socket.id, x: pos.x, y: pos.y });
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