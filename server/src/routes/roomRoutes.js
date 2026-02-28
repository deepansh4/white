import { Router } from 'express';
import { roomController } from '../controllers/roomController.js';

const router = Router();

router.get('/', roomController.listRooms);
router.get('/:roomId', roomController.getRoom);

export default router;
