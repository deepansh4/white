import React, { useState } from 'react';
import { Users, Copy, Check, Wifi, WifiOff, Loader2, Undo2, Redo2 } from 'lucide-react';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';
import { cn } from '@/lib/utils';

const StatusDot = ({ status }) => {
  const map = {
    connected:  { icon: Wifi,    color: 'text-green-600', label: 'Connected',       spin: false },
    connecting: { icon: Loader2, color: 'text-amber-500', label: 'Connecting…',     spin: true  },
    error:      { icon: WifiOff, color: 'text-red-500',   label: 'Connection error',spin: false },
    idle:       { icon: WifiOff, color: 'text-ink-muted', label: 'Disconnected',    spin: false },
  };
  const { icon: Icon, color, label, spin } = map[status] || map.idle;
  return (
    <span title={label} className={cn('flex items-center gap-1.5 text-xs font-body', color)}>
      <Icon size={13} className={spin ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
};

/**
 * Undo / Redo button pair.
 * Receives handlers from WhiteboardPage so this component stays presentational.
 */
const UndoRedoControls = ({ onUndo, onRedo }) => {
  const { canUndo, canRedo } = useWhiteboardStore();

  return (
    <div className="flex items-center gap-1 p-1 bg-canvas-bg rounded-xl border border-canvas-line">
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150',
          canUndo
            ? 'text-ink-soft hover:bg-ink/8 hover:text-ink active:scale-95'
            : 'text-ink-muted/30 cursor-not-allowed',
        )}
      >
        <Undo2 size={15} strokeWidth={1.8} />
      </button>

      <div className="w-px h-4 bg-canvas-line" />

      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150',
          canRedo
            ? 'text-ink-soft hover:bg-ink/8 hover:text-ink active:scale-95'
            : 'text-ink-muted/30 cursor-not-allowed',
        )}
      >
        <Redo2 size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
};

export const RoomHeader = ({ roomId, onUndo, onRedo }) => {
  const { users, selfUser, connectionStatus } = useWhiteboardStore();
  const [copied, setCopied] = useState(false);

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="flex items-center justify-between px-4 py-2.5 bg-chalk border-b border-canvas-line shadow-sm z-20">

      {/* Brand + room code */}
      <div className="flex items-center gap-3">
        <span className="font-display text-xl text-ink tracking-tight">Board</span>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-canvas-bg rounded-lg border border-canvas-line">
          <span className="font-mono text-sm text-ink-soft tracking-widest select-all">{roomId}</span>
          <button
            onClick={copyRoomId}
            className="ml-1 text-ink-muted hover:text-ink transition-colors"
            title={copied ? 'Copied!' : 'Copy room code'}
          >
            {copied
              ? <Check size={13} className="text-green-600" />
              : <Copy size={13} />
            }
          </button>
        </div>
      </div>

      {/* Centre: presence avatars + undo/redo */}
      <div className="flex items-center gap-3">
        {/* Presence */}
        <div className="flex items-center gap-1.5">
          <Users size={14} className="text-ink-muted" />
          <div className="flex -space-x-1.5">
            {users.slice(0, 8).map((u) => (
              <div
                key={u.id}
                title={u.username + (u.id === selfUser?.id ? ' (you)' : '')}
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-body font-semibold text-white ring-2 ring-chalk',
                  u.id === selfUser?.id ? 'ring-ink' : '',
                )}
                style={{ background: u.color }}
              >
                {u.username[0]?.toUpperCase()}
              </div>
            ))}
            {users.length > 8 && (
              <div className="w-7 h-7 rounded-full bg-ink-muted ring-2 ring-chalk flex items-center justify-center text-xs text-chalk font-body">
                +{users.length - 8}
              </div>
            )}
          </div>
          <span className="ml-1 text-xs text-ink-muted font-body">{users.length} online</span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-canvas-line" />

        {/* Undo / Redo */}
        <UndoRedoControls onUndo={onUndo} onRedo={onRedo} />
      </div>

      {/* Right: connection status */}
      <StatusDot status={connectionStatus} />
    </header>
  );
};