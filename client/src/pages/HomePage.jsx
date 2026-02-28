import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, ArrowRight, Hash } from 'lucide-react';
import { generateRoomId } from '@/lib/utils';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';

export const HomePage = () => {
  const navigate = useNavigate();
  const { setUsername, setRoomId } = useWhiteboardStore();

  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [error, setError] = useState('');

  const enter = (roomId) => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    setUsername(name.trim());
    setRoomId(roomId);
    navigate(`/board/${roomId}`);
  };

  const createRoom = () => enter(generateRoomId());
  const joinRoom = (e) => {
    e.preventDefault();
    if (!room.trim()) { setError('Enter a room code'); return; }
    enter(room.trim().toUpperCase());
  };

  return (
    <div className="min-h-screen bg-canvas-bg flex flex-col items-center justify-center px-4">
      {/* Decorative grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage: `
            linear-gradient(rgba(200,196,188,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(200,196,188,0.4) 1px, transparent 1px)
          `,
          backgroundSize: '56px 56px',
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 bg-ink rounded-2xl flex items-center justify-center mb-4 shadow-float">
            <Pencil size={24} className="text-chalk" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-4xl text-ink tracking-tight">Board</h1>
          <p className="font-body text-ink-muted mt-1 text-sm">Real-time collaborative whiteboard</p>
        </div>

        <div className="bg-chalk rounded-2xl shadow-panel border border-canvas-line p-6 space-y-5">
          {/* Name input */}
          <div>
            <label className="block text-xs font-body font-medium text-ink-muted uppercase tracking-widest mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="e.g. Alex"
              maxLength={24}
              className="w-full px-3.5 py-2.5 bg-canvas-bg border border-canvas-line rounded-xl text-sm font-body text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink/40 transition-all"
            />
          </div>

          {/* Create new */}
          <button
            onClick={createRoom}
            className="w-full flex items-center justify-between px-4 py-3 bg-ink text-chalk rounded-xl font-body font-medium text-sm hover:bg-ink-soft transition-colors group"
          >
            <span>Create new board</span>
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-canvas-line" />
            <span className="text-xs text-ink-muted font-body">or join existing</span>
            <div className="flex-1 h-px bg-canvas-line" />
          </div>

          {/* Join existing */}
          <form onSubmit={joinRoom} className="flex gap-2">
            <div className="flex-1 relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                value={room}
                onChange={(e) => { setRoom(e.target.value.toUpperCase()); setError(''); }}
                placeholder="Room code"
                maxLength={8}
                className="w-full pl-8 pr-3 py-2.5 bg-canvas-bg border border-canvas-line rounded-xl text-sm font-mono text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink/40 transition-all"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-accent text-chalk rounded-xl font-body font-medium text-sm hover:bg-accent-hover transition-colors"
            >
              Join
            </button>
          </form>

          {error && (
            <p className="text-xs text-accent font-body text-center -mt-2">{error}</p>
          )}
        </div>

        <p className="text-center text-xs text-ink-muted font-body mt-5">
          Share the room code with collaborators to draw together
        </p>
      </div>
    </div>
  );
};
