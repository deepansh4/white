import React, {
  useRef, forwardRef, useImperativeHandle,
  useState, useCallback, useEffect, useLayoutEffect, useReducer,
} from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useCanvas, CANVAS_W, CANVAS_H } from '@/hooks/useCanvas';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';

// ── Pen cursor (SVG data-URI, hotspot at nib tip) ──────────────────────────────
const PEN_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
  `<path d='M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/>` +
  `<circle cx='2.5' cy='21.5' r='1' fill='black'/></svg>`,
);
const penCursor = `url("data:image/svg+xml,${PEN_SVG}") 2 22, crosshair`;

const MIN_ZOOM = 0.04;
const MAX_ZOOM = 10;
const clamp    = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Canvas ──────────────────────────────────────────────────────────────────────
const Canvas = forwardRef(({ rendererRef, emit }, ref) => {
  const canvasRef        = useRef(null);
  const overlayCanvasRef = useRef(null);
  const viewportRef      = useRef(null);   // the outer clipping div
  const xformDivRef      = useRef(null);   // the CSS-transform wrapper
  const gridDivRef       = useRef(null);   // the grid overlay (updated imperatively)
  const zoomLabelRef     = useRef(null);   // the "xx%" text (updated imperatively)

  // Expose main canvas to parent for PNG download
  useImperativeHandle(ref, () => canvasRef.current);

  const { tool, eraserSize, cursors, users } = useWhiteboardStore();

  // Keep always-current refs so event-handler closures never go stale
  const toolRef       = useRef(tool);
  const eraserSizeRef = useRef(eraserSize);
  useEffect(() => { toolRef.current       = tool;       }, [tool]);
  useEffect(() => { eraserSizeRef.current = eraserSize; }, [eraserSize]);

  // ── Transform: pan (x,y) + zoom ──────────────────────────────────────────────
  // T.current is updated synchronously inside event handlers; the DOM is patched
  // immediately (imperative, for 60 fps); a useReducer tick then re-renders React
  // for anything that must stay in sync (eraser ring, cursor label, etc.).
  //
  // Initial value zoom:1 is a safe natural-size fallback. It is overwritten by
  // initialView() in useLayoutEffect before the browser ever paints, so it is
  // never actually visible. zoom:1 is preferred over 0.25 so that if the viewport
  // ref is unexpectedly null the canvas sits at a readable size rather than tiny.
  const [, tick] = useReducer(n => n + 1, 0);
  const T        = useRef({ x: 0, y: 0, zoom: 1 });

  // Imperatively apply the transform to the DOM (bypasses React diffing for speed)
  const applyDOM = useCallback((t) => {
    if (xformDivRef.current) {
      xformDivRef.current.style.transform =
        `translate(${t.x}px,${t.y}px) scale(${t.zoom})`;
    }
    if (gridDivRef.current) {
      const sz = 48 * t.zoom;
      gridDivRef.current.style.backgroundSize     = `${sz}px ${sz}px`;
      gridDivRef.current.style.backgroundPosition = `${t.x % sz}px ${t.y % sz}px`;
    }
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(t.zoom * 100)}%`;
    }
  }, []);

  // commit = update ref + DOM + schedule a React re-render
  const commit = useCallback((newT) => {
    T.current = newT;
    applyDOM(newT);
    tick();
  }, [applyDOM]);

  // Zoom toward a viewport-relative point (vpX, vpY)
  const zoomTo = useCallback((vpX, vpY, newZoom) => {
    const { x, y, zoom } = T.current;
    const z2 = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
    commit({ x: vpX - (vpX - x) / zoom * z2, y: vpY - (vpY - y) / zoom * z2, zoom: z2 });
  }, [commit]);

  // ── initialView — used ONLY for the first render ────────────────────────────
  // Clamps zoom to [0.85, 1] so the canvas opens at near-native resolution.
  // On screens smaller than the canvas the raw ratio is less than 0.85, so we
  // floor at 0.85 — meaning the canvas is larger than the viewport and the user
  // sees the centre of it. On 4K screens the raw ratio reaches 1.0 (capped there
  // to avoid making the canvas appear "zoomed in" on high-res displays).
  // The centering formula (vp.dim - CANVAS_DIM * zoom) / 2 is identical to
  // fitView but with the different zoom value; it correctly produces a negative
  // offset when the canvas is wider/taller than the viewport (panning to centre).
  //
  // ⚠️  This function is intentionally NOT wired to the "fit" button.
  //     The "fit" button calls fitView(), which always shows the full canvas.
  const initialView = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const rawZoom = Math.min(vp.clientWidth / CANVAS_W, vp.clientHeight / CANVAS_H);
    const zoom    = clamp(rawZoom, 0.85, 1);
    commit({
      x: (vp.clientWidth  - CANVAS_W * zoom) / 2,
      y: (vp.clientHeight - CANVAS_H * zoom) / 2,
      zoom,
    });
  }, [commit]);

  // ── fitView — "fit to screen" button ────────────────────────────────────────
  // Always shows the entire canvas with 10% padding, regardless of current zoom.
  // This is the semantic meaning users expect from a "fit" action.
  const fitView = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const zoom = Math.min(vp.clientWidth / CANVAS_W, vp.clientHeight / CANVAS_H) * 0.9;
    commit({
      x: (vp.clientWidth  - CANVAS_W * zoom) / 2,
      y: (vp.clientHeight - CANVAS_H * zoom) / 2,
      zoom,
    });
  }, [commit]);

  // Apply initialView before the first paint. fitView is used by the button only.
  useLayoutEffect(initialView, []);

  // ── Wheel → zoom (ctrl/meta) or pan (scroll) ─────────────────────────────────
  // Must be a non-passive listener so we can call preventDefault()
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r  = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch or Ctrl+scroll → zoom toward cursor
        zoomTo(cx, cy, T.current.zoom * Math.pow(0.999, e.deltaY));
      } else {
        // Trackpad two-finger scroll or mouse wheel → pan
        const { x, y, zoom } = T.current;
        commit({ x: x - e.deltaX, y: y - e.deltaY, zoom });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo, commit]);

  // ── Space bar → temporary pan mode ───────────────────────────────────────────
  const spaceHeld = useRef(false);
  useEffect(() => {
    const dn = (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        if (!spaceHeld.current) { spaceHeld.current = true; tick(); }
      }
    };
    const up = (e) => {
      if (e.code === 'Space') { spaceHeld.current = false; tick(); }
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  // ── Drawing handlers from useCanvas ──────────────────────────────────────────
  const {
    handlePointerDown: drawDn,
    handlePointerMove: drawMv,
    handlePointerUp:   drawUp,
  } = useCanvas(canvasRef, overlayCanvasRef, rendererRef, emit);

  // ── Multi-pointer state ───────────────────────────────────────────────────────
  const ptrs       = useRef(new Map());    // pointerId → {x, y} in client coords
  const pinching   = useRef(false);
  const lastPin    = useRef(null);         // { dist, cx, cy }
  const dragOrigin = useRef(null);         // { px, py, tx, ty }
  const drawing    = useRef(false);

  // Eraser ring — updated only when eraser is active
  const [eraserRing, setEraserRing] = useState({ x: 0, y: 0, visible: false });

  // ── Pointer down ─────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    // Capture all subsequent pointer events on this element
    e.currentTarget.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const count = ptrs.current.size;

    // ── Two+ fingers → pinch / pan gesture ─────────────────────────────────
    if (count >= 2) {
      // Abort any in-progress stroke so we don't leave a dangling state
      if (drawing.current) { drawUp(e); drawing.current = false; }
      pinching.current = true;
      dragOrigin.current = null;
      const ps = [...ptrs.current.values()];
      lastPin.current = {
        dist: Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y),
        cx:   (ps[0].x + ps[1].x) / 2,
        cy:   (ps[0].y + ps[1].y) / 2,
      };
      return;
    }

    // ── Pan tool or Space held → drag to pan ───────────────────────────────
    if (toolRef.current === 'pan' || spaceHeld.current) {
      dragOrigin.current = {
        px: e.clientX, py: e.clientY,
        tx: T.current.x, ty: T.current.y,
      };
      return;
    }

    // ── Drawing tool ──────────────────────────────────────────────────────
    drawing.current = true;
    drawDn(e);
  }, [drawDn, drawUp]);

  // ── Pointer move ─────────────────────────────────────────────────────────────
  const onPointerMove = useCallback((e) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // ── Pinch: zoom from distance + pan from midpoint drift ────────────────
    if (pinching.current) {
      const ps = [...ptrs.current.values()];
      if (ps.length < 2 || !lastPin.current) return;

      const dist = Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y);
      const cx   = (ps[0].x + ps[1].x) / 2;
      const cy   = (ps[0].y + ps[1].y) / 2;

      const vpr    = viewportRef.current.getBoundingClientRect();
      const vpX    = cx - vpr.left;
      const vpY    = cy - vpr.top;
      const lastVX = lastPin.current.cx - vpr.left;
      const lastVY = lastPin.current.cy - vpr.top;

      const { x, y, zoom } = T.current;
      const newZoom = clamp(zoom * (dist / lastPin.current.dist), MIN_ZOOM, MAX_ZOOM);

      // Canvas point under last midpoint → should land under current midpoint
      const cx_c = (lastVX - x) / zoom;
      const cy_c = (lastVY - y) / zoom;
      commit({ x: vpX - cx_c * newZoom, y: vpY - cy_c * newZoom, zoom: newZoom });

      lastPin.current = { dist, cx, cy };
      return;
    }

    // ── Pan drag ──────────────────────────────────────────────────────────
    if (dragOrigin.current) {
      const { px, py, tx, ty } = dragOrigin.current;
      const { zoom } = T.current;
      commit({ x: tx + e.clientX - px, y: ty + e.clientY - py, zoom });
      return;
    }

    // ── Drawing ──────────────────────────────────────────────────────────
    if (drawing.current) {
      if (toolRef.current === 'eraser') {
        const r = viewportRef.current.getBoundingClientRect();
        setEraserRing({ x: e.clientX - r.left, y: e.clientY - r.top, visible: true });
      }
      drawMv(e);
    }
  }, [drawMv, commit]);

  // ── Pointer up / cancel ───────────────────────────────────────────────────────
  const onPointerUp = useCallback((e) => {
    ptrs.current.delete(e.pointerId);
    const rem = ptrs.current.size;

    if (rem < 2) { pinching.current = false; lastPin.current  = null; }
    if (rem === 0) { dragOrigin.current = null; }

    if (drawing.current) {
      drawing.current = false;
      setEraserRing(r => ({ ...r, visible: false }));
      drawUp(e);
    }
  }, [drawUp]);

  const onPointerCancel = useCallback((e) => {
    ptrs.current.delete(e.pointerId);
    pinching.current   = false;
    lastPin.current    = null;
    dragOrigin.current = null;
    if (drawing.current) { drawing.current = false; drawUp(e); }
  }, [drawUp]);

  // ── Cursor ────────────────────────────────────────────────────────────────────
  const isPanMode = tool === 'pan' || spaceHeld.current;
  const cursorStyle = isPanMode  ? 'grab'
    : tool === 'pen'    ? penCursor
    : tool === 'eraser' ? 'none'
    : 'crosshair';

  // Eraser ring diameter in viewport pixels — matches canvas lineWidth × zoom
  // useCanvas sets lineWidth = eraserSize × 4; displayed at zoom that's eraserSize × 4 × zoom px
  const ringD   = eraserSize * 4 * T.current.zoom;
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  // Initial inline styles (populated by applyDOM via useLayoutEffect / commit)
  const { x: tx, y: ty, zoom: tz } = T.current;
  const gridSz  = 48 * tz;

  return (
    <div
      ref={viewportRef}
      className="relative w-full h-full overflow-hidden bg-canvas-bg touch-none"
      style={{ cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* ── Grid — aligned with canvas coordinate system ─────────────────── */}
      <div
        ref={gridDivRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(200,196,188,0.35) 1px,transparent 1px),' +
            'linear-gradient(90deg,rgba(200,196,188,0.35) 1px,transparent 1px)',
          backgroundSize:     `${gridSz}px ${gridSz}px`,
          backgroundPosition: `${tx % gridSz}px ${ty % gridSz}px`,
        }}
      />

      {/* ── Canvas transform wrapper ─────────────────────────────────────── */}
      <div
        ref={xformDivRef}
        className="absolute top-0 left-0"
        style={{
          width:           CANVAS_W,
          height:          CANVAS_H,
          transformOrigin: '0 0',
          transform:       `translate(${tx}px,${ty}px) scale(${tz})`,
        }}
      >
        {/* Main persistent drawing surface */}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ width: CANVAS_W, height: CANVAS_H, display: 'block' }}
        />

        {/* Shape preview overlay — pointer-events-none so events fall through */}
        <canvas
          ref={overlayCanvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 pointer-events-none"
          style={{ width: CANVAS_W, height: CANVAS_H }}
        />

        {/* ── Remote peer cursors (canvas coordinate space) ──────────────── */}
        {Object.entries(cursors).map(([uid, cur]) => {
          const u = userMap[uid];
          if (!u) return null;
          return (
            <div
              key={uid}
              className="absolute pointer-events-none"
              style={{
                left: cur.x,
                top:  cur.y,
                transition: 'left 60ms linear, top 60ms linear',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M3 2L17 10L10 12L7 18L3 2Z"
                  fill={u.color}
                  stroke="#fff"
                  strokeWidth="1.5"
                />
              </svg>
              <span
                className="absolute top-5 left-2 font-body font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
                style={{ fontSize: 11, background: u.color, color: '#fff' }}
              >
                {u.username}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Eraser ring (viewport space, scaled with zoom) ────────────────── */}
      {tool === 'eraser' && (
        <div
          className="absolute pointer-events-none rounded-full border-2 border-ink/60"
          style={{
            width:      ringD,
            height:     ringD,
            left:       eraserRing.x - ringD / 2,
            top:        eraserRing.y - ringD / 2,
            opacity:    eraserRing.visible ? 1 : 0,
            background: 'rgba(255,255,255,0.15)',
            boxShadow:  '0 0 0 1px rgba(255,255,255,0.6)',
            transition: 'opacity 80ms',
          }}
        />
      )}

      {/* ── Zoom controls (bottom-right, hidden on mobile — use pinch) ──────── */}
      <div className="absolute bottom-4 right-4 z-30 hidden md:flex flex-col items-center gap-1.5">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => {
            const vp = viewportRef.current;
            zoomTo(vp.clientWidth / 2, vp.clientHeight / 2, T.current.zoom * 1.3);
          }}
          title="Zoom in"
          className="w-8 h-8 bg-chalk border border-canvas-line rounded-lg shadow-tool flex items-center justify-center text-ink-soft hover:bg-ink/8 active:scale-95 transition-all"
        >
          <ZoomIn size={14} strokeWidth={1.8} />
        </button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => {
            const vp = viewportRef.current;
            zoomTo(vp.clientWidth / 2, vp.clientHeight / 2, T.current.zoom * 0.77);
          }}
          title="Zoom out"
          className="w-8 h-8 bg-chalk border border-canvas-line rounded-lg shadow-tool flex items-center justify-center text-ink-soft hover:bg-ink/8 active:scale-95 transition-all"
        >
          <ZoomOut size={14} strokeWidth={1.8} />
        </button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={fitView}
          title="Fit to screen (F)"
          className="w-8 h-8 bg-chalk border border-canvas-line rounded-lg shadow-tool flex items-center justify-center text-ink-soft hover:bg-ink/8 active:scale-95 transition-all"
        >
          <Maximize2 size={12} strokeWidth={1.8} />
        </button>
        <span
          ref={zoomLabelRef}
          className="text-[10px] font-mono text-ink-muted select-none leading-none"
        >
          {Math.round(tz * 100)}%
        </span>
      </div>

      {/* ── Mobile zoom controls (minimal — pinch is primary) ─────────────── */}
      <div className="absolute bottom-20 right-3 z-30 md:hidden flex flex-col items-center gap-1">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => {
            const vp = viewportRef.current;
            zoomTo(vp.clientWidth / 2, vp.clientHeight / 2, T.current.zoom * 1.4);
          }}
          title="Zoom in"
          className="w-9 h-9 bg-chalk/90 backdrop-blur-sm border border-canvas-line rounded-xl shadow-tool flex items-center justify-center text-ink-soft active:scale-95 transition-all"
        >
          <ZoomIn size={15} strokeWidth={1.8} />
        </button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => {
            const vp = viewportRef.current;
            zoomTo(vp.clientWidth / 2, vp.clientHeight / 2, T.current.zoom * 0.7);
          }}
          title="Zoom out"
          className="w-9 h-9 bg-chalk/90 backdrop-blur-sm border border-canvas-line rounded-xl shadow-tool flex items-center justify-center text-ink-soft active:scale-95 transition-all"
        >
          <ZoomOut size={15} strokeWidth={1.8} />
        </button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={fitView}
          title="Fit"
          className="w-9 h-9 bg-chalk/90 backdrop-blur-sm border border-canvas-line rounded-xl shadow-tool flex items-center justify-center text-ink-soft active:scale-95 transition-all"
        >
          <Maximize2 size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
});

Canvas.displayName = 'Canvas';
export default Canvas;