import { Router } from 'express';
import { roomController } from '../controllers/roomController.js';
import { validateRoomId, guardRoomList } from '../middleware/validateRequest.js';
import { roomCreateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

/**
 * POST /api/rooms
 *
 * Creates a new room. The server generates the UUID — the client never does.
 * Rate-limited by roomCreateLimiter (20 rooms / hour / IP) to prevent farming.
 *
 * Response: { roomId: "<uuid-v4>" }
 */
router.post('/', roomCreateLimiter, roomController.createRoom);

/**
 * GET /api/rooms
 * Lists active rooms. Admin-only in production.
 */
router.get('/', guardRoomList, roomController.listRooms);

/**
 * GET /api/rooms/:roomId
 * Returns public metadata for one room. Format-validated before the controller.
 */
router.get('/:roomId', validateRoomId, roomController.getRoom);

export default router;