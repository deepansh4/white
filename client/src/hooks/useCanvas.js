import { useRef, useCallback, useImperativeHandle } from 'react';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';

export const CANVAS_W = 3840;
export const CANVAS_H = 2160;

const FREEHAND_TOOLS = new Set(['pen', 'eraser']);
const genId = () => Math.random().toString(36).slice(2, 10);
const midpt = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// ── Style ──────────────────────────────────────────────────────────────────────

const applyStyle = (ctx, s) => {
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  if (s.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth   = s.eraserSize != null ? s.eraserSize : 24;
    ctx.globalAlpha = 1;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color     || '#1A1814';
    ctx.lineWidth   = s.lineWidth || 3;
    ctx.globalAlpha = s.opacity   ?? 1;
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
    const m = midpt(points[i - 1], points[i]);
    ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, m.x, m.y);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.stroke();
  resetCtx(ctx);
};

export const drawFreehandSegment = (ctx, points, strokeData) => {
  const n = points.length;
  if (n < 2) return;
  applyStyle(ctx, strokeData);
  ctx.beginPath();
  if (n === 2) {
    const m = midpt(points[0], points[1]);
    ctx.moveTo(points[0].x, points[0].y);
    ctx.quadraticCurveTo(points[0].x, points[0].y, m.x, m.y);
  } else {
    const a = points[n - 3], b = points[n - 2], c = points[n - 1];
    ctx.moveTo(midpt(a, b).x, midpt(a, b).y);
    ctx.quadraticCurveTo(b.x, b.y, midpt(b, c).x, midpt(b, c).y);
  }
  ctx.stroke();
  resetCtx(ctx);
};

const drawFreehandTail = (ctx, points, strokeData) => {
  const n = points.length;
  if (n < 2) return;
  applyStyle(ctx, strokeData);
  ctx.beginPath();
  ctx.moveTo(midpt(points[n - 2], points[n - 1]).x, midpt(points[n - 2], points[n - 1]).y);
  ctx.lineTo(points[n - 1].x, points[n - 1].y);
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
    ctx.ellipse(cx, cy,
      Math.abs(end.x - start.x) / 2,
      Math.abs(end.y - start.y) / 2,
      0, 0, Math.PI * 2);
  }
  ctx.stroke();
  resetCtx(ctx);
};

// ── Hook ───────────────────────────────────────────────────────────────────────

export const useCanvas = (
  canvasRef,           // main drawing canvas
  overlayCanvasRef,    // local shape preview
  remoteOverlayRef,    // remote in-progress strokes
  rendererRef,         // imperative handle for socket events
  emit,                // socket emit fn
) => {
  const { tool, color, lineWidth, opacity, eraserSize } = useWhiteboardStore();

  const isDrawing     = useRef(false);
  const currentStroke = useRef([]);
  const shapeStart    = useRef(null);
  const remoteStrokes = useRef({});
  const lastCursorTs  = useRef(0);
  const CURSOR_MS     = 33; // ~30 Hz

  const getCtx        = () => canvasRef.current?.getContext('2d');
  const getOverlayCtx = () => overlayCanvasRef.current?.getContext('2d');
  const getRemoteCtx  = () => remoteOverlayRef.current?.getContext('2d');
  const clearOverlay  = () => { const c = getOverlayCtx(); if (c) c.clearRect(0, 0, CANVAS_W, CANVAS_H); };

  // ── Coordinate conversion ──────────────────────────────────────────────────
  // Use getBoundingClientRect on the canvas element itself — the most direct
  // and unambiguous mapping from screen pixels to canvas pixels.
  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: Math.max(0, Math.min(CANVAS_W, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(CANVAS_H, (e.clientY - rect.top)  * scaleY)),
    };
  }, [canvasRef]);

  // ── Remote overlay helpers ─────────────────────────────────────────────────
  const redrawRemoteOverlay = () => {
    const ctx = getRemoteCtx();
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    Object.values(remoteStrokes.current).forEach((s) => {
      if (FREEHAND_TOOLS.has(s.tool)) {
        if (s.points.length >= 2) drawFreehand(ctx, s.points, s);
      } else if (s.startPoint && s.endPoint) {
        drawShape(ctx, s.startPoint, s.endPoint, s);
      }
    });
  };

  // ── Pointer handlers ───────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    const pos = getPos(e);
    isDrawing.current = true;

    if (FREEHAND_TOOLS.has(tool)) {
      currentStroke.current = [pos];
      emit('draw:start', { points: [pos], tool, color, lineWidth, opacity, eraserSize });
    } else {
      shapeStart.current = pos;
      emit('draw:start', { startPoint: pos, tool, color, lineWidth, opacity });
    }
  }, [tool, color, lineWidth, opacity, eraserSize, emit, getPos]);

  const handlePointerMove = useCallback((e) => {
    const pos = getPos(e);

    const now = Date.now();
    if (now - lastCursorTs.current >= CURSOR_MS) {
      emit('cursor:move', pos);
      lastCursorTs.current = now;
    }

    if (!isDrawing.current) return;

    if (FREEHAND_TOOLS.has(tool)) {
      currentStroke.current.push(pos);
      const ctx = getCtx();
      if (ctx) drawFreehandSegment(ctx, currentStroke.current,
        { tool, color, lineWidth, opacity, eraserSize });
      emit('draw:move', { point: pos });
    } else {
      clearOverlay();
      const oc = getOverlayCtx();
      if (oc && shapeStart.current)
        drawShape(oc, shapeStart.current, pos, { tool, color, lineWidth, opacity });
      emit('draw:move', { point: pos });
    }
  }, [tool, color, lineWidth, opacity, eraserSize, emit, getPos]);

  const handlePointerUp = useCallback((e) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (FREEHAND_TOOLS.has(tool)) {
      const ctx = getCtx();
      const pts = currentStroke.current;

      if (pts.length === 1) {
        pts.push({ ...pts[0] });
        if (ctx) drawFreehand(ctx, pts, { tool, color, lineWidth, opacity, eraserSize });
      } else if (pts.length >= 2) {
        if (ctx) drawFreehandTail(ctx, pts, { tool, color, lineWidth, opacity, eraserSize });
      }

      emit('draw:end', { id: genId(), points: pts, tool, color, lineWidth, opacity, eraserSize });
      currentStroke.current = [];
    } else {
      clearOverlay();
      const pos = getPos(e);
      const ctx = getCtx();
      if (ctx && shapeStart.current)
        drawShape(ctx, shapeStart.current, pos, { tool, color, lineWidth, opacity });
      emit('draw:end', {
        id: genId(),
        startPoint: shapeStart.current,
        endPoint: pos,
        tool, color, lineWidth, opacity,
      });
      shapeStart.current = null;
    }
  }, [tool, color, lineWidth, opacity, eraserSize, emit, getPos]);

  const handlePointerCancel = useCallback(() => {
    isDrawing.current = false;
    currentStroke.current = [];
    shapeStart.current = null;
    clearOverlay();
  }, []);

  // ── Remote renderer API ────────────────────────────────────────────────────
  useImperativeHandle(rendererRef, () => ({
    remoteDrawStart(data) {
      remoteStrokes.current[data.userId] = {
        points:     data.points     || [],
        startPoint: data.startPoint || null,
        endPoint:   null,
        tool:       data.tool,
        color:      data.color,
        lineWidth:  data.lineWidth,
        opacity:    data.opacity,
        eraserSize: data.eraserSize,
      };
    },
    remoteDrawMove(data) {
      const s = remoteStrokes.current[data.userId];
      if (!s) return;
      if (FREEHAND_TOOLS.has(s.tool)) s.points.push(data.point);
      else s.endPoint = data.point;
      redrawRemoteOverlay();
    },
    remoteDrawEnd(data) {
      const ctx = getCtx();
      if (!ctx) return;
      delete remoteStrokes.current[data.userId];
      redrawRemoteOverlay();
      if (FREEHAND_TOOLS.has(data.tool)) {
        if (data.points?.length >= 2) drawFreehand(ctx, data.points, data);
      } else if (data.startPoint && data.endPoint) {
        drawShape(ctx, data.startPoint, data.endPoint, data);
      }
    },
    replayStrokes(strokes) {
      const ctx = getCtx();
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      const rCtx = getRemoteCtx();
      if (rCtx) rCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      remoteStrokes.current = {};
      strokes.forEach((s) => {
        if (FREEHAND_TOOLS.has(s.tool)) {
          if (s.points?.length >= 2) drawFreehand(ctx, s.points, s);
        } else if (s.startPoint && s.endPoint) {
          drawShape(ctx, s.startPoint, s.endPoint, s);
        }
      });
    },
    clear() {
      const ctx = getCtx();
      if (ctx) ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      const rCtx = getRemoteCtx();
      if (rCtx) rCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      remoteStrokes.current = {};
    },
  }));

  return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel };
};