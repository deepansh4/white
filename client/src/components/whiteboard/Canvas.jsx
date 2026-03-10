import React, {
  useRef, useState, useEffect, useCallback,
  forwardRef, useImperativeHandle, useReducer,
} from 'react';
import { useCanvas, CANVAS_W, CANVAS_H } from '@/hooks/useCanvas';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';

// ── Pen cursor SVG hotspot ─────────────────────────────────────────────────────
// width=24 height=24, nib tip at (2,22). Hotspot "2 22" aligns e.clientX/Y
// with the nib tip so drawing always starts exactly at the visible tip.
const PEN_SVG = encodeURIComponent([
  `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>`,
  `<path d='M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'`,
  ` fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/>`,
  `<circle cx='2.5' cy='21.5' r='1.2' fill='black'/>`,
  `</svg>`,
].join(''));
const PEN_CURSOR = `url("data:image/svg+xml,${PEN_SVG}") 2 22, crosshair`;

// ── Canvas component ───────────────────────────────────────────────────────────
const Canvas = forwardRef(({ rendererRef, emit, applyViewportRef }, ref) => {

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const wrapRef          = useRef(null);   // outer event-receiving div
  const mainCanvasRef    = useRef(null);   // committed strokes
  const overlayCanvasRef = useRef(null);   // local shape preview
  const remoteOverlayRef = useRef(null);   // remote in-progress strokes

  // Expose main canvas to parent (for PNG download)
  useImperativeHandle(ref, () => mainCanvasRef.current);

  // applyViewportRef contract — no-op here (each client keeps its own view)
  useEffect(() => {
    if (applyViewportRef) applyViewportRef.current = () => {};
  });

  const { tool, eraserSize, cursors, users } = useWhiteboardStore();

  // ── useCanvas hook ────────────────────────────────────────────────────────────
  // Pass only the 5 stable arguments. getPos inside the hook reads
  // mainCanvasRef.current.getBoundingClientRect() on every event call.
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useCanvas(mainCanvasRef, overlayCanvasRef, remoteOverlayRef, rendererRef, emit);

  // ── Eraser ring state ─────────────────────────────────────────────────────────
  const [ring, setRing] = useState({ x: 0, y: 0, visible: false });

  // ── Pointer event handlers ────────────────────────────────────────────────────
  // All pointer events go to the outer div. The canvas layers inside have
  // pointer-events: none (except mainCanvasRef which has no explicit override,
  // but since it's inside a div with handlers, bubbling works regardless).
  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    // Capture so pointermove/up fire even when cursor leaves the element
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointerDown(e);
  }, [handlePointerDown]);

  const onPointerMove = useCallback((e) => {
    e.preventDefault();
    if (tool === 'eraser') {
      // Position ring using the same rect that getPos uses: mainCanvasRef.
      const canvas = mainCanvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setRing({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
      }
    }
    handlePointerMove(e);
  }, [tool, handlePointerMove]);

  const onPointerUp = useCallback((e) => {
    e.preventDefault();
    handlePointerUp(e);
  }, [handlePointerUp]);

  const onPointerLeave = useCallback(() => {
    setRing(r => ({ ...r, visible: false }));
  }, []);

  const onPointerCancelOrLost = useCallback((e) => {
    handlePointerCancel(e);
    setRing(r => ({ ...r, visible: false }));
  }, [handlePointerCancel]);

  // ── Zoom for visual helpers (grid, ring, remote cursors) ─────────────────────
  // Recompute on window resize so the grid tracks canvas scale.
  const [, forceUpdate] = useReducer(n => n + 1, 0);
  useEffect(() => {
    const ro = new ResizeObserver(forceUpdate);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);

  const canvasEl = mainCanvasRef.current;
  const zoom     = canvasEl ? canvasEl.getBoundingClientRect().width / CANVAS_W : 1;
  const ringD    = eraserSize * zoom;
  const gridPx   = 48 * zoom;

  const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));
  const cursor  = tool === 'pen' ? PEN_CURSOR : tool === 'eraser' ? 'none' : 'crosshair';

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full touch-none overflow-hidden select-none"
      style={{ cursor, background: '#F8F6F0' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancelOrLost}
      onLostPointerCapture={onPointerCancelOrLost}
    >
      {/* Grid background — sits behind the canvas */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: [
            'linear-gradient(rgba(200,196,188,0.4) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(200,196,188,0.4) 1px, transparent 1px)',
          ].join(','),
          backgroundSize: `${gridPx}px ${gridPx}px`,
        }}
      />

      {/* Main canvas — transparent so eraser punches through to grid */}
      <canvas
        ref={mainCanvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Local shape-preview overlay */}
      <canvas
        ref={overlayCanvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Remote in-progress overlay */}
      <canvas
        ref={remoteOverlayRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Remote cursors */}
      {Object.entries(cursors || {}).map(([uid, cur]) => {
        const u = userMap[uid];
        if (!u) return null;
        return (
          <div
            key={uid}
            className="absolute pointer-events-none"
            style={{
              left:       cur.x * zoom,
              top:        cur.y * zoom,
              transition: 'left 60ms linear, top 60ms linear',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 2L17 10L10 12L7 18L3 2Z"
                fill={u.color} stroke="#fff" strokeWidth="1.5" />
            </svg>
            <span
              className="absolute top-5 left-2 px-1.5 py-0.5 rounded text-white whitespace-nowrap"
              style={{ fontSize: 11, background: u.color }}
            >
              {u.username}
            </span>
          </div>
        );
      })}

      {/* Eraser ring — centered on cursor, diameter matches stroke width */}
      {tool === 'eraser' && (
        <div
          className="absolute pointer-events-none rounded-full border-2 border-stone-400"
          style={{
            width:      ringD,
            height:     ringD,
            left:       ring.x - ringD / 2,
            top:        ring.y - ringD / 2,
            opacity:    ring.visible ? 1 : 0,
            background: 'rgba(255,255,255,0.15)',
            transition: 'opacity 80ms',
          }}
        />
      )}
    </div>
  );
});

Canvas.displayName = 'Canvas';
export default Canvas;