/**
 * Client-side socket payload sanitizer.
 *
 * All data arriving from the server passes through here before touching the
 * Zustand store or canvas. This is defense-in-depth: the server validates
 * everything with Zod, but we never unconditionally trust the wire.
 *
 * Rules applied:
 *   • Allowlist approach — only expected fields are forwarded
 *   • All numbers are clamped to safe ranges
 *   • Strings are length-capped and HTML-escaped where rendered
 *   • Invalid payloads return null and are silently dropped by the caller
 *   • No dynamic HTML construction — text is always set via textContent
 */

const CANVAS_W = 3840;
const CANVAS_H = 2160;
const VALID_TOOLS = new Set(['pen', 'eraser', 'line', 'rect', 'circle']);
const HEX_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
const STROKE_ID_RE = /^[a-z0-9]+$/;

const clamp  = (n, min, max) => Math.min(max, Math.max(min, n));
const isFin  = (v) => typeof v === 'number' && Number.isFinite(v);
const isSafeStr = (v, max) => typeof v === 'string' && v.length <= max;

/**
 * Sanitize a canvas coordinate point.
 * Returns { x, y } clamped to the canvas area, or null on failure.
 */
const safeCoord = (pt) => {
  if (!pt || typeof pt !== 'object') return null;
  if (!isFin(pt.x) || !isFin(pt.y)) return null;
  return {
    x: clamp(pt.x, -10, CANVAS_W + 10),
    y: clamp(pt.y, -10, CANVAS_H + 10),
  };
};

/**
 * Sanitize a hex color string.
 * Falls back to a safe default if the value is missing or malformed.
 */
const safeColor = (c) =>
  typeof c === 'string' && HEX_RE.test(c) ? c : '#1A1814';

/**
 * Sanitize the base fields common to all stroke types.
 * Returns the sanitized base or null if the payload is obviously invalid.
 */
const safeStrokeBase = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (!VALID_TOOLS.has(raw.tool)) return null;

  const id = typeof raw.id === 'string' && STROKE_ID_RE.test(raw.id.slice(0, 32))
    ? raw.id.slice(0, 32)
    : 'unknown';

  return {
    id,
    tool:       raw.tool,
    color:      safeColor(raw.color),
    lineWidth:  isFin(raw.lineWidth)  ? clamp(raw.lineWidth, 1, 200)   : 3,
    opacity:    isFin(raw.opacity)    ? clamp(raw.opacity, 0, 1)       : 1,
    eraserSize: isFin(raw.eraserSize) ? clamp(raw.eraserSize, 1, 400)  : 24,
    // userId and timestamp are display-only; truncate to prevent oversized strings
    userId:    isSafeStr(raw.userId, 128)    ? raw.userId    : '',
    timestamp: isSafeStr(raw.timestamp, 64) ? raw.timestamp : new Date().toISOString(),
  };
};

// ── Public sanitizers ──────────────────────────────────────────────────────────

/** Sanitize a complete stroke (freehand or shape). Returns null on failure. */
export const sanitizeStroke = (raw) => {
  const base = safeStrokeBase(raw);
  if (!base) return null;

  // Freehand stroke
  if (Array.isArray(raw.points)) {
    const points = raw.points
      .slice(0, 10_000)
      .map(safeCoord)
      .filter(Boolean);
    if (points.length < 2) return null;
    return { ...base, points };
  }

  // Shape stroke
  const startPoint = safeCoord(raw.startPoint);
  const endPoint   = safeCoord(raw.endPoint);
  if (!startPoint || !endPoint) return null;
  return { ...base, startPoint, endPoint };
};

/** Sanitize an array of strokes (used on room join and board:replay). */
export const sanitizeStrokeArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 5_000).map(sanitizeStroke).filter(Boolean);
};

/** Sanitize a cursor position event. */
export const sanitizeCursor = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const coord = safeCoord(raw);
  if (!coord) return null;
  return {
    ...coord,
    userId: isSafeStr(raw.userId, 128) ? raw.userId : '',
  };
};

/**
 * Sanitize a user list for presence display.
 * Username is HTML-escaped because it's rendered as text in the DOM.
 */
export const sanitizeUsers = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(0, 200)
    .map((u) => {
      if (!u || typeof u !== 'object') return null;
      return {
        id:       isSafeStr(u.id, 128)       ? u.id        : '',
        // Strip HTML chars — rendered as text content, not innerHTML
        username: isSafeStr(u.username, 32)
          ? u.username.replace(/[<>"'&]/g, '').trim() || 'Guest'
          : 'Guest',
        color:    safeColor(u.color),
        joinedAt: isSafeStr(u.joinedAt, 64)  ? u.joinedAt  : '',
      };
    })
    .filter((u) => u && u.id);
};

/**
 * Sanitize the history state payload { canUndo, canRedo }.
 * Coerces to booleans — prevents truthy injection attacks.
 */
export const sanitizeHistoryState = (raw) => {
  if (!raw || typeof raw !== 'object') return { canUndo: false, canRedo: false };
  return {
    canUndo: raw.canUndo === true,
    canRedo: raw.canRedo === true,
  };
};