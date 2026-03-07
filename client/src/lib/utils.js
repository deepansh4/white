import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs) => twMerge(clsx(inputs));

/**
 * UUID v4 regex — mirrors the server-side UUID_V4_RE in validateRequest.js.
 * Used client-side to validate user-typed room codes before attempting to join.
 * A passing format does not guarantee the room exists — the server is authoritative.
 */
export const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidRoomId = (id) => UUID_V4_RE.test(id);

export const getPointerPos = (e, canvas) => {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const src    = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top)  * scaleY,
  };
};