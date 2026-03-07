import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

/**
 * HTTP rate limiters.
 *
 * Two separate limiters with different policies:
 *
 *   httpRateLimiter      — global, applied to all routes (300 req / 15 min per IP)
 *   roomCreateLimiter    — tight, applied only to POST /api/rooms
 *                          Prevents automated room farming / resource exhaustion.
 *                          20 rooms / hour per IP is generous for human use.
 *
 * WebSocket drawing events are NOT rate-limited — see drawingHandler.js.
 */

export const httpRateLimiter = rateLimit({
  windowMs:        config.httpRateLimit.windowMs,
  max:             config.httpRateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests, please try again later.' },
});

export const roomCreateLimiter = rateLimit({
  windowMs:        config.roomCreateRateLimit.windowMs,
  max:             config.roomCreateRateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  // Generic message — don't reveal the exact limit to potential attackers
  message: { error: 'Too many rooms created. Please try again later.' },
  // Skip the global limiter's key; use a dedicated one for create
  keyGenerator: (req) => `room_create:${req.ip}`,
});