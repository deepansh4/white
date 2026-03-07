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
  const { roomId } = useParams();
  const navigate   = useNavigate();
  const { username, setRoomId, roomError, clearRoomError } = useWhiteboardStore();

  // Redirect to home if no username (page refreshed without going through HomePage)
  useEffect(() => { if (!username) navigate('/'); }, [username]);

  // Validate the UUID format client-side before even connecting.
  // If the URL contains a malformed ID, send the user home immediately
  // with a clear error — no socket connection attempted.
  useEffect(() => {
    if (roomId && !isValidRoomId(roomId)) {
      navigate('/?error=invalid-room', { replace: true });
    }
  }, [roomId]);

  useEffect(() => { if (roomId) setRoomId(roomId); }, [roomId]);

  // ── Room error navigation ────────────────────────────────────────────────────
  // useSocket sets roomError in the store when the server rejects the join.
  // We navigate here (in the page) rather than in the hook so the hook stays
  // presentation-free and testable without a router context.
  useEffect(() => {
    if (!roomError) return;
    clearRoomError();
    if (roomError === 'ROOM_NOT_FOUND') {
      navigate('/?error=room-not-found', { replace: true });
    }
  }, [roomError]);

  const rendererRef = useRef(null);
  const canvasRef   = useRef(null);

  const { emit, emitUndo, emitRedo } = useSocket(rendererRef);

  const handleClear = useCallback(() => emit('draw:clear'), [emit]);

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
    link.download      = `board-${Date.now()}.png`;
    link.href          = offscreen.toDataURL('image/png');
    link.click();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); emitRedo(); return; }
      if (e.key === 'z' || e.key === 'Z')                  { e.preventDefault(); emitUndo(); return; }
      if (e.key === 'y' || e.key === 'Y')                  { e.preventDefault(); emitRedo(); }
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