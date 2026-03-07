import dotenv from 'dotenv';
dotenv.config();

const int = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`Env var ${key} must be an integer, got: "${raw}"`);
  return n;
};

/**
 * Centralised, frozen config. No other module touches process.env directly.
 * Never import this module in any client-facing bundle.
 */
export const config = Object.freeze({
  port:      int('PORT', 3001),
  nodeEnv:   process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  isDev:     (process.env.NODE_ENV || 'development') === 'development',

  // ── Collaborative history ──────────────────────────────────────────────────
  historyLimit: int('HISTORY_LIMIT', 100),

  // ── HTTP rate limiting — global (all REST endpoints) ──────────────────────
  httpRateLimit: Object.freeze({
    windowMs: int('HTTP_RATE_WINDOW_MS', 15 * 60 * 1000),  // 15-min window
    max:      int('HTTP_RATE_MAX', 300),
  }),

  // ── Room creation rate limiting — POST /api/rooms only ───────────────────
  // Tighter than the global limit to prevent automated room farming.
  // 20 rooms per hour per IP is generous for human use and blocks bots.
  roomCreateRateLimit: Object.freeze({
    windowMs: int('ROOM_CREATE_RATE_WINDOW_MS', 60 * 60 * 1000),  // 1-hour window
    max:      int('ROOM_CREATE_RATE_MAX', 20),
  }),

  // ── Canvas bounds (must match client CANVAS_W / CANVAS_H constants) ───────
  canvas: Object.freeze({ width: 3840, height: 2160 }),
});