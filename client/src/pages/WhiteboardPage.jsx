import React, { useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';
import { useSocket } from '@/hooks/useSocket';
import { RoomHeader } from '@/components/whiteboard/RoomHeader';
import { Toolbar } from '@/components/whiteboard/Toolbar';
import { EraserSizeSlider } from '@/components/whiteboard/EraserSizeSlider';
import Canvas from '@/components/whiteboard/Canvas';
import { isValidRoomId } from '@/lib/utils';

export const WhiteboardPage = () => {
  const { roomId }  = useParams();
  const navigate    = useNavigate();
  const {
    username, setRoomId, roomError, clearRoomError, setTool,
  } = useWhiteboardStore();

  // ── Guards ───────────────────────────────────────────────────────────────────
  useEffect(() => { if (!username) navigate('/'); }, [username]);

  useEffect(() => {
    if (roomId && !isValidRoomId(roomId)) {
      navigate('/?error=invalid-room', { replace: true });
    }
  }, [roomId]);

  useEffect(() => { if (roomId) setRoomId(roomId); }, [roomId]);

  useEffect(() => {
    if (!roomError) return;
    clearRoomError();
    if (roomError === 'ROOM_NOT_FOUND') navigate('/?error=room-not-found', { replace: true });
  }, [roomError]);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const rendererRef = useRef(null);
  const canvasRef   = useRef(null);

  // applyViewportRef is the bridge for incoming viewport:change events.
  //
  // Socket path (no React state involved):
  //   viewport:change received → useSocket calls applyViewportRef.current(vp)
  //                            → Canvas.commit({ x, y, zoom })
  //                            → DOM updated immediately (imperative, 60fps)
  //
  // Canvas sets applyViewportRef.current = commit on every render so it is
  // always the latest function. useSocket closes over the ref object itself
  // (stable), and reads .current at call time (always fresh).
  const applyViewportRef = useRef(null);

  const { emit, emitUndo, emitRedo } = useSocket(rendererRef, applyViewportRef);

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleClear    = useCallback(() => emit('draw:clear'), [emit]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const off      = document.createElement('canvas');
    off.width      = canvas.width;
    off.height     = canvas.height;
    const ctx      = off.getContext('2d');
    ctx.fillStyle  = '#F8F6F0';
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(canvas, 0, 0);
    const link     = document.createElement('a');
    link.download  = `board-${Date.now()}.png`;
    link.href      = off.toDataURL('image/png');
    link.click();
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); emitRedo(); return; }
        if (e.key === 'z' || e.key === 'Z')                  { e.preventDefault(); emitUndo(); return; }
        if (e.key === 'y' || e.key === 'Y')                  { e.preventDefault(); emitRedo(); return; }
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'p': setTool('pen');    break;
        case 'e': setTool('eraser'); break;
        case 'l': setTool('line');   break;
        case 'r': setTool('rect');   break;
        case 'c': setTool('circle'); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emitUndo, emitRedo, setTool]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-canvas-bg">
      <RoomHeader roomId={roomId} onUndo={emitUndo} onRedo={emitRedo} />
      <div className="flex flex-1 overflow-hidden relative">
        <EraserSizeSlider />
        <Toolbar onClear={handleClear} onDownload={handleDownload} />
        <div className="flex-1 relative">
          <Canvas
            ref={canvasRef}
            rendererRef={rendererRef}
            emit={emit}
            applyViewportRef={applyViewportRef}
          />
        </div>
      </div>
    </div>
  );
};