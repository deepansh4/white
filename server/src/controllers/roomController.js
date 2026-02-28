import { whiteboardService } from '../services/whiteboardService.js';

export const roomController = {
  listRooms(req, res) {
    res.json({ rooms: whiteboardService.listRooms() });
  },

  getRoom(req, res) {
    const room = whiteboardService.getRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({
      id: room.id,
      userCount: room.users.size,
      strokeCount: room.strokes.length,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    });
  },
};
