import React, { useRef, forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { useCanvas, CANVAS_W, CANVAS_H } from '@/hooks/useCanvas';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';
import { cn } from '@/lib/utils';

/**
 * Two-canvas setup:
 *   canvasRef        — main persistent drawing surface
 *   overlayCanvasRef — ephemeral shape preview (cleared each pointer move)
 *
 * Also renders:
 *   • Remote peer cursors (CSS overlay, not on canvas)
 *   • Eraser size ring that follows the local cursor when eraser is active
 *
 * Pen cursor: SVG data-URI injected via a <style> tag so the hotspot sits
 * exactly at the nib tip (2, 22 in a 24×24 viewBox).
 */

// ── Cursor SVGs ────────────────────────────────────────────────────────────────
const PEN_CURSOR_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>
  <path d='M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'
        fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/>
  <circle cx='2.5' cy='21.5' r='1' fill='black'/>
</svg>`;

const penCursorUrl = `url("data:image/svg+xml,${encodeURIComponent(PEN_CURSOR_SVG)}") 2 22, crosshair`;

const Canvas = forwardRef(({ rendererRef, emit }, ref) => {
  const canvasRef        = useRef(null);
  const overlayCanvasRef = useRef(null);

  // Expose main canvas to parent (for PNG download)
  useImperativeHandle(ref, () => canvasRef.current);

  const { tool, eraserSize, cursors, users } = useWhiteboardStore();

  // Eraser ring state — tracks local mouse position in % of container
  const [eraserPos, setEraserPos] = useState({ x: -200, y: -200, visible: false });

  const {
    handlePointerDown,
    handlePointerMove: _handlePointerMove,
    handlePointerUp,
  } = useCanvas(canvasRef, overlayCanvasRef, rendererRef, emit);

  // Wrap handlePointerMove to also update eraser ring position
  const handlePointerMove = useCallback((e) => {
    _handlePointerMove(e);
    if (tool === 'eraser') {
      const rect = e.currentTarget.getBoundingClientRect();
      setEraserPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        visible: true,
      });
    }
  }, [_handlePointerMove, tool]);

  const handlePointerLeave = useCallback((e) => {
    handlePointerUp(e);
    setEraserPos((p) => ({ ...p, visible: false }));
  }, [handlePointerUp]);

  const handlePointerEnter = useCallback(() => {
    if (tool === 'eraser') setEraserPos((p) => ({ ...p, visible: true }));
  }, [tool]);

  // Resolve cursor style per tool
  const cursorStyle = (() => {
    switch (tool) {
      case 'pen':    return penCursorUrl;
      case 'eraser': return 'none';               // hidden — ring is shown instead
      default:       return 'crosshair';
    }
  })();

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  // Eraser ring diameter in CSS pixels (eraserSize is "visual" px, canvas is 4× display)
  // We show the ring at eraserSize px to match what actually gets erased on screen.
  const ringDiameter = eraserSize;

  return (
    <div className="relative w-full h-full overflow-hidden bg-canvas-bg">
      {/* Grid paper texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(200,196,188,0.35) 1px, transparent 1px),
            linear-gradient(90deg, rgba(200,196,188,0.35) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Main persistent canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className={cn('absolute inset-0 w-full h-full touch-none')}
        style={{ cursor: cursorStyle }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerEnter={handlePointerEnter}
      />

      {/* Shape preview overlay — pointer-events-none so events fall through */}
      <canvas
        ref={overlayCanvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* ── Eraser ring ──────────────────────────────────────────────────────── */}
      {tool === 'eraser' && (
        <div
          className="absolute pointer-events-none rounded-full border-2 border-ink/60"
          style={{
            width:     ringDiameter,
            height:    ringDiameter,
            left:      eraserPos.x - ringDiameter / 2,
            top:       eraserPos.y - ringDiameter / 2,
            opacity:   eraserPos.visible ? 1 : 0,
            background: 'rgba(255,255,255,0.15)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.6)',
            transition: 'opacity 80ms',
          }}
        />
      )}

      {/* ── Remote cursors ────────────────────────────────────────────────────── */}
      {Object.entries(cursors).map(([userId, cursor]) => {
        const user = userMap[userId];
        if (!user) return null;
        const pctX = (cursor.x / CANVAS_W) * 100;
        const pctY = (cursor.y / CANVAS_H) * 100;
        return (
          <div
            key={userId}
            className="absolute pointer-events-none"
            style={{
              left: `${pctX}%`,
              top:  `${pctY}%`,
              transition: 'left 60ms linear, top 60ms linear',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 2L17 10L10 12L7 18L3 2Z"
                fill={user.color}
                stroke="#fff"
                strokeWidth="1.5"
              />
            </svg>
            <span
              className="absolute top-5 left-2 text-xs font-body font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{ background: user.color, color: '#fff' }}
            >
              {user.username}
            </span>
          </div>
        );
      })}
    </div>
  );
});

Canvas.displayName = 'Canvas';
export default Canvas;