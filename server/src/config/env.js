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
  // Maximum undoable actions per room. Oldest actions are dropped when exceeded.
  historyLimit: int('HISTORY_LIMIT', 100),

  // ── HTTP rate limiting (REST endpoints only) ──────────────────────────────
  // WebSocket drawing events are NOT rate-limited — see drawingHandler.js.
  httpRateLimit: Object.freeze({
    windowMs: int('HTTP_RATE_WINDOW_MS', 15 * 60 * 1000),  // 15 min window
    max:      int('HTTP_RATE_MAX', 300),                     // requests per window per IP
  }),

  // ── Canvas bounds (must match client CANVAS_W / CANVAS_H constants) ───────
  canvas: Object.freeze({ width: 3840, height: 2160 }),
});