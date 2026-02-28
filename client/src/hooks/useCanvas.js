import { useRef, useCallback, useImperativeHandle } from 'react';
import { getPointerPos } from '@/lib/utils';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';

export const CANVAS_W = 3840;
export const CANVAS_H = 2160;

const FREEHAND_TOOLS = new Set(['pen', 'eraser']);

/** Tiny unique ID for each stroke (client-generated, echoed by server). */
const genId = () => Math.random().toString(36).slice(2, 10);

// ── Canvas style helpers ───────────────────────────────────────────────────────

const applyStyle = (ctx, s) => {
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  if (s.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    // eraserSize is the visual diameter; ×4 because canvas resolution is 4× display
    ctx.lineWidth   = (s.eraserSize || s.lineWidth || 24) * 4;
    ctx.globalAlpha = 1;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color    || '#1A1814';
    ctx.lineWidth   = s.lineWidth || 3;
    ctx.globalAlpha = s.opacity  ?? 1;
  }
};

const resetCtx = (ctx) => {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
};

// ── Drawing primitives ─────────────────────────────────────────────────────────

export const drawFreehand = (ctx, points, strokeData) => {
  if (!points || points.length < 2) return;
  applyStyle(ctx, strokeData);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const mid = {
      x: (points[i - 1].x + points[i].x) / 2,
      y: (points[i - 1].y + points[i].y) / 2,
    };
    ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, mid.x, mid.y);
  }
  ctx.stroke();
  resetCtx(ctx);
};

export const drawShape = (ctx, start, end, strokeData) => {
  if (!start || !end) return;
  applyStyle(ctx, strokeData);
  ctx.beginPath();

  if (strokeData.tool === 'line') {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  } else if (strokeData.tool === 'rect') {
    ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (strokeData.tool === 'circle') {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }

  ctx.stroke();
  resetCtx(ctx);
};

// ── Hook ───────────────────────────────────────────────────────────────────────

export const useCanvas = (canvasRef, overlayCanvasRef, rendererRef, emit) => {
  const { tool, color, lineWidth, opacity, eraserSize } = useWhiteboardStore();

  const isDrawing     = useRef(false);
  const currentStroke = useRef([]);
  const shapeStart    = useRef(null);
  const lastPos       = useRef({ x: 0, y: 0 });
  const remoteStrokes = useRef({});

  // ── Client-side cursor throttle ───────────────────────────────────────────────
  // cursor:move is throttled to ~30 Hz here on the client — cursors are purely
  // cosmetic so occasional dropped positions are imperceptible.
  //
  // draw:move is NOT throttled. Every point must reach the server so remote
  // peers receive a complete point sequence for smooth quadratic-bezier rendering.
  // Missing waypoints leave visible gaps that cannot be reconstructed.
  //
  const lastCursorEmit = useRef(0);
  const CURSOR_INTERVAL_MS = 33; // ~30 Hz

  const getCtx        = () => canvasRef.current?.getContext('2d');
  const getOverlayCtx = () => overlayCanvasRef.current?.getContext('2d');

  const clearOverlay = () => {
    const ctx = getOverlayCtx();
    if (ctx) ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  };

  // ── Pointer down ──────────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = getPointerPos(e, canvas);
    lastPos.current   = pos;
    isDrawing.current = true;

    if (FREEHAND_TOOLS.has(tool)) {
      currentStroke.current = [pos];
      // draw:start is NOT rate-limited on the server — always send immediately
      emit('draw:start', { points: [pos], tool, color, lineWidth, opacity, eraserSize });
    } else {
      shapeStart.current = pos;
      emit('draw:start', { startPoint: pos, tool, color, lineWidth, opacity });
    }
  }, [tool, color, lineWidth, opacity, eraserSize, emit]);

  // ── Pointer move ──────────────────────────────────────────────────────────────
  const handlePointerMove = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = getPointerPos(e, canvas);
    lastPos.current = pos;

    // Throttle cursor:move to ~30 Hz — these are cosmetic and can lag without issue
    const now = Date.now();
    if (now - lastCursorEmit.current >= CURSOR_INTERVAL_MS) {
      emit('cursor:move', pos);
      lastCursorEmit.current = now;
    }

    if (!isDrawing.current) return;

    if (FREEHAND_TOOLS.has(tool)) {
      currentStroke.current.push(pos);
      const ctx = getCtx();
      if (ctx) drawFreehand(ctx, currentStroke.current.slice(-3), { tool, color, lineWidth, opacity, eraserSize });
      // Every point is emitted — no throttle — so remote peers render smooth curves.
      emit('draw:move', { point: pos });
    } else {
      clearOverlay();
      const overlayCtx = getOverlayCtx();
      if (overlayCtx && shapeStart.current) {
        drawShape(overlayCtx, shapeStart.current, pos, { tool, color, lineWidth, opacity });
      }
      emit('draw:move', { point: pos });
    }
  }, [tool, color, lineWidth, opacity, eraserSize, emit]);

  // ── Pointer up ────────────────────────────────────────────────────────────────
  const handlePointerUp = useCallback((e) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (FREEHAND_TOOLS.has(tool)) {
      const strokeId = genId();
      // draw:end is NOT rate-limited on the server — always send
      emit('draw:end', {
        id: strokeId,
        points: currentStroke.current,
        tool, color, lineWidth, opacity, eraserSize,
      });
      currentStroke.current = [];
    } else {
      clearOverlay();
      const canvas = canvasRef.current;
      const pos = canvas ? getPointerPos(e, canvas) : lastPos.current;
      const ctx = getCtx();
      if (ctx && shapeStart.current) {
        drawShape(ctx, shapeStart.current, pos, { tool, color, lineWidth, opacity });
      }
      const strokeId = genId();
      emit('draw:end', {
        id: strokeId,
        startPoint: shapeStart.current,
        endPoint: pos,
        tool, color, lineWidth, opacity,
      });
      shapeStart.current = null;
    }
  }, [tool, color, lineWidth, opacity, eraserSize, emit]);

  // ── Remote renderer API ───────────────────────────────────────────────────────
  useImperativeHandle(rendererRef, () => ({

    remoteDrawStart(data) {
      // Initialise tracking entry so subsequent draw:move events can be rendered
      remoteStrokes.current[data.userId] = {
        points:     data.points     || [],
        startPoint: data.startPoint || null,
        tool:       data.tool,
        color:      data.color,
        lineWidth:  data.lineWidth,
        opacity:    data.opacity,
        eraserSize: data.eraserSize,
      };
    },

    remoteDrawMove(data) {
      const stroke = remoteStrokes.current[data.userId];
      if (!stroke) return;

      if (FREEHAND_TOOLS.has(stroke.tool)) {
        stroke.points.push(data.point);
        const ctx = getCtx();
        if (ctx) drawFreehand(ctx, stroke.points.slice(-3), stroke);
      }
      // Shape tools: re-render the overlay on every move (not stored here — handled remotely)
    },

    remoteDrawEnd(data) {
      const ctx = getCtx();
      if (!ctx) return;

      // Was this stroke tracked incrementally via remoteDrawStart + remoteDrawMove?
      const wasTracked = Boolean(remoteStrokes.current[data.userId]);

      if (FREEHAND_TOOLS.has(data.tool)) {
        // Fallback: if draw:start was somehow missed (network hiccup, reconnect),
        // draw:end carries the full points array — render the complete stroke now.
        // Skip if already drawn incrementally to avoid double-drawing.
        if (!wasTracked && data.points?.length >= 2) {
          drawFreehand(ctx, data.points, data);
        }
      } else if (data.startPoint && data.endPoint) {
        drawShape(ctx, data.startPoint, data.endPoint, data);
      }

      delete remoteStrokes.current[data.userId];
    },

    replayStrokes(strokes) {
      const ctx = getCtx();
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      strokes.forEach((s) => {
        if (FREEHAND_TOOLS.has(s.tool)) {
          if (s.points?.length >= 2) drawFreehand(ctx, s.points, s);
        } else {
          if (s.startPoint && s.endPoint) drawShape(ctx, s.startPoint, s.endPoint, s);
        }
      });
    },

    clear() {
      const ctx = getCtx();
      if (ctx) ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    },
  }));

  return { handlePointerDown, handlePointerMove, handlePointerUp, CANVAS_W, CANVAS_H };
};