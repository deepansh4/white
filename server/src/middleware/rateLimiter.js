import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

/**
 * HTTP rate limiter — applied globally in app.js.
 * Prevents brute-force and DoS on REST endpoints.
 */
export const httpRateLimiter = rateLimit({
  windowMs: config.httpRateLimit.windowMs,
  max:      config.httpRateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests, please try again later.' },
});