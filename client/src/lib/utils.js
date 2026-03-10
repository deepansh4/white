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

/**
 * Convert a viewport-container-relative coordinate to canvas space using the
 * current pan/zoom transform T = { x, y, zoom }.
 *
 * ⚠️  vpX and vpY must be relative to the VIEWPORT CONTAINER element, not the
 * window.  T.x/T.y are the CSS translate values applied to the canvas wrapper
 * div WITHIN that container — both values share the same origin.
 *
 * Callers (e.g. getPos in useCanvas) must subtract the container's bounding
 * rect from the raw PointerEvent.clientX/Y before calling this function:
 *
 *   const r = viewportEl.getBoundingClientRect();   // once per gesture
 *   const pos = viewportToCanvas(e.clientX - r.left, e.clientY - r.top, T);
 *
 * Passing raw window-relative clientX/Y without the subtraction produces
 * coordinates that are wrong by (container.left, container.top) — typically
 * just the header height on the Y axis, but enough to misplace every stroke.
 */
export const viewportToCanvas = (vpX, vpY, T) => ({
  x: (vpX - T.x) / T.zoom,
  y: (vpY - T.y) / T.zoom,
});

/**
 * @deprecated Use viewportToCanvas(e.clientX, e.clientY, T) instead.
 * Kept only for components that haven't been migrated yet.
 */
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