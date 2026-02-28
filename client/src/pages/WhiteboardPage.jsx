import React, { useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';
import { useSocket } from '@/hooks/useSocket';
import { RoomHeader } from '@/components/whiteboard/RoomHeader';
import { Toolbar } from '@/components/whiteboard/Toolbar';
import { EraserSizeSlider } from '@/components/whiteboard/EraserSizeSlider';
import Canvas from '@/components/whiteboard/Canvas';

export const WhiteboardPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { username, setRoomId } = useWhiteboardStore();

  useEffect(() => { if (!username) navigate('/'); }, [username]);
  useEffect(() => { if (roomId) setRoomId(roomId); }, [roomId]);

  const rendererRef = useRef(null);
  const canvasRef   = useRef(null);

  const { emit, emitUndo, emitRedo } = useSocket(rendererRef);

  // ── Board actions ────────────────────────────────────────────────────────────
  // draw:clear is an undoable server action; history:state broadcast updates buttons
  const handleClear    = useCallback(() => emit('draw:clear'), [emit]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const offscreen    = document.createElement('canvas');
    offscreen.width    = canvas.width;
    offscreen.height   = canvas.height;
    const ctx          = offscreen.getContext('2d');
    ctx.fillStyle      = '#F8F6F0';
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(canvas, 0, 0);
    const link         = document.createElement('a');
    link.download      = `board-${roomId}-${Date.now()}.png`;
    link.href          = offscreen.toDataURL('image/png');
    link.click();
  }, [roomId]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); emitRedo(); return; }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); emitUndo(); return; }
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); emitRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emitUndo, emitRedo]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-canvas-bg">
      <RoomHeader roomId={roomId} onUndo={emitUndo} onRedo={emitRedo} />

      <div className="flex flex-1 overflow-hidden relative">
        <EraserSizeSlider />

        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-30">
          <Toolbar onClear={handleClear} onDownload={handleDownload} />
        </div>

        <div className="flex-1 relative">
          <Canvas ref={canvasRef} rendererRef={rendererRef} emit={emit} />
        </div>
      </div>
    </div>
  );
};