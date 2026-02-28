import { z } from 'zod';
import { config } from '../../config/env.js';

const { width: CW, height: CH } = config.canvas;

// ── Primitives ────────────────────────────────────────────────────────────────

const coord = z.object({
  x: z.number().finite().min(-10).max(CW + 10),
  y: z.number().finite().min(-10).max(CH + 10),
});

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/, 'Invalid hex color')
  .default('#1A1814');

const tool = z.enum(['pen', 'eraser', 'line', 'rect', 'circle']);

const strokeId = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9]+$/, 'Invalid stroke ID');

const pointsArray = z.array(coord).min(1).max(10_000);

// ── Stroke base ───────────────────────────────────────────────────────────────

/**
 * Shared drawing properties for any stroke type.
 * Used by draw:end (persisted strokes) which MUST include an id.
 */
const baseStroke = z.object({
  id:         strokeId,
  tool,
  color:      hexColor,
  lineWidth:  z.number().finite().min(1).max(200).default(3),
  opacity:    z.number().finite().min(0).max(1).default(1),
  eraserSize: z.number().finite().min(1).max(400).optional(),
});

/**
 * draw:start is ephemeral — the stroke ID has NOT been generated yet on the
 * client (the ID is only created when the stroke is committed in draw:end).
 * Using a separate base without `id` prevents all draw:start events from
 * being silently dropped by Zod validation.
 */
const baseStrokeNoId = z.object({
  tool,
  color:      hexColor,
  lineWidth:  z.number().finite().min(1).max(200).default(3),
  opacity:    z.number().finite().min(0).max(1).default(1),
  eraserSize: z.number().finite().min(1).max(400).optional(),
});

// ── Exported schemas ──────────────────────────────────────────────────────────

export const freehandStrokeSchema = baseStroke.extend({ points: pointsArray });
export const shapeStrokeSchema    = baseStroke.extend({ startPoint: coord, endPoint: coord });

/** draw:end — persisted, must have id and either points or startPoint+endPoint. */
export const drawEndSchema = z.union([freehandStrokeSchema, shapeStrokeSchema]);

/**
 * draw:start — ephemeral broadcast, no id required.
 * Accepts freehand (points array) or shape (startPoint anchor).
 */
export const drawStartSchema = z.union([
  baseStrokeNoId.extend({ points:     pointsArray }),
  baseStrokeNoId.extend({ startPoint: coord }),
]);

/** draw:move — single new point for both freehand and shape tools. */
export const drawMoveSchema = z.object({ point: coord });

// ── Room schemas ──────────────────────────────────────────────────────────────

export const roomJoinSchema = z.object({
  roomId: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Z0-9]+$/, 'Invalid room ID'),

  username: z
    .string()
    .min(1)
    .max(32)
    .transform((s) => s.replace(/[<>"'&;()\\/]/g, '').trim())
    .pipe(z.string().min(1, 'Username empty after sanitization')),
});

export const cursorMoveSchema = coord;

// ── Parse helper ──────────────────────────────────────────────────────────────

export const safeParse = (schema, data, label = '') => {
  const result = schema.safeParse(data);
  if (!result.success) {
    if (config.isDev) {
      console.warn(`[validation] ${label}:`, result.error.flatten().fieldErrors);
    }
    return null;
  }
  return result.data;
};