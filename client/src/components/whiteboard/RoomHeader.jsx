import React, { useState, useRef, useEffect } from 'react';
import { Users, Copy, Check, Wifi, WifiOff, Loader2, Undo2, Redo2, Crown } from 'lucide-react';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';
import { cn } from '@/lib/utils';

// ── Connection status indicator ────────────────────────────────────────────────
const StatusDot = ({ status }) => {
  const map = {
    connected:  { icon: Wifi,    color: 'text-green-600', label: 'Connected',       spin: false },
    connecting: { icon: Loader2, color: 'text-amber-500', label: 'Connecting…',     spin: true  },
    error:      { icon: WifiOff, color: 'text-red-500',   label: 'Connection error', spin: false },
    idle:       { icon: WifiOff, color: 'text-ink-muted', label: 'Disconnected',    spin: false },
  };
  const { icon: Icon, color, label, spin } = map[status] || map.idle;
  return (
    <span title={label} className={cn('flex items-center gap-1.5 text-xs font-body shrink-0', color)}>
      <Icon size={13} className={spin ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
};

// ── Undo / Redo ────────────────────────────────────────────────────────────────
const UndoRedo = ({ onUndo, onRedo }) => {
  const { canUndo, canRedo } = useWhiteboardStore();
  return (
    <div className="flex items-center gap-1 p-1 bg-canvas-bg rounded-xl border border-canvas-line shrink-0">
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className={cn(
          'flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-lg transition-all duration-150',
          canUndo
            ? 'text-ink-soft hover:bg-ink/8 hover:text-ink active:scale-95'
            : 'text-ink-muted/30 cursor-not-allowed',
        )}
      >
        <Undo2 size={14} strokeWidth={1.8} />
      </button>
      <div className="w-px h-4 bg-canvas-line" />
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        className={cn(
          'flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-lg transition-all duration-150',
          canRedo
            ? 'text-ink-soft hover:bg-ink/8 hover:text-ink active:scale-95'
            : 'text-ink-muted/30 cursor-not-allowed',
        )}
      >
        <Redo2 size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
};

// ── Avatar ─────────────────────────────────────────────────────────────────────
const Avatar = ({ user, selfId, size = 'md', showRing = true }) => {
  const isSelf = user.id === selfId;
  const sz     = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs';
  return (
    <div
      title={user.username + (isSelf ? ' (you)' : '')}
      className={cn(
        'rounded-full flex items-center justify-center font-body font-semibold text-white shrink-0',
        sz,
        showRing && 'ring-2 ring-chalk',
        showRing && isSelf && 'ring-ink',
      )}
      style={{ background: user.color }}
    >
      {user.username[0]?.toUpperCase()}
    </div>
  );
};

// ── Presence cluster + floating panel ─────────────────────────────────────────
const MAX_VISIBLE = 4; // max avatars shown before "+N" overflow

const PresenceCluster = ({ users, selfUser }) => {
  const [open, setOpen] = useState(false);
  const wrapRef         = useRef(null);

  // Close panel on click outside
  useEffect(() => {
    if (!open) return;
    const fn = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    // Small delay so the same click that opened it doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('pointerdown', fn), 50);
    return () => {
      clearTimeout(id);
      document.removeEventListener('pointerdown', fn);
    };
  }, [open]);

  const visible  = users.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, users.length - MAX_VISIBLE);

  return (
    <div ref={wrapRef} className="relative flex items-center gap-2">
      {/* Clickable presence trigger ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-xl transition-colors',
          open ? 'bg-ink/8' : 'hover:bg-ink/6',
        )}
        title={open ? 'Hide participants' : 'Show participants'}
        aria-expanded={open}
      >
        {/* Icon + count */}
        <Users
          size={13}
          className={cn('transition-colors', open ? 'text-ink' : 'text-ink-muted')}
        />

        {/* Stacked avatars */}
        <div className="flex -space-x-1.5" aria-hidden>
          {visible.map(u => (
            <Avatar key={u.id} user={u} selfId={selfUser?.id} />
          ))}
          {overflow > 0 && (
            <div
              className="w-7 h-7 rounded-full bg-board ring-2 ring-chalk flex items-center justify-center text-[10px] text-chalk font-body font-bold shrink-0"
              title={`+${overflow} more`}
            >
              +{overflow}
            </div>
          )}
        </div>

        <span className="hidden sm:inline text-xs text-ink-muted font-body tabular-nums">
          {users.length}
        </span>
      </button>

      {/* ── Floating participants panel ─────────────────────────────────── */}
      <div
        role="dialog"
        aria-label="Participants"
        className={cn(
          // Layout
          'absolute right-0 w-56 z-50 overflow-hidden',
          // Positioning — drops below the header
          'top-[calc(100%+8px)]',
          // Appearance
          'bg-chalk border border-canvas-line rounded-xl shadow-float',
          // Animation: scale + fade from top-right origin
          'transition-all duration-200 ease-out origin-top-right',
          open
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-95 -translate-y-1 pointer-events-none',
        )}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-canvas-line">
          <span className="text-[10px] font-body font-semibold text-ink-muted uppercase tracking-wider">
            Participants
          </span>
          <span className="text-[10px] font-mono text-ink-muted bg-canvas-bg px-1.5 py-0.5 rounded-full">
            {users.length} online
          </span>
        </div>

        {/* User list */}
        <ul className="max-h-60 overflow-y-auto py-1" role="list">
          {users.map((u, i) => {
            const isSelf  = u.id === selfUser?.id;
            const isFirst = i === 0; // room creator (joined first)
            return (
              <li
                key={u.id}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-ink/4 transition-colors"
              >
                <Avatar user={u} selfId={selfUser?.id} showRing={false} />

                <span
                  className={cn(
                    'text-sm font-body truncate flex-1',
                    isSelf ? 'text-ink font-medium' : 'text-ink-soft',
                  )}
                >
                  {u.username}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  {isFirst && (
                    <Crown
                      size={11}
                      className="text-amber-500"
                      title="Room creator"
                      strokeWidth={1.8}
                    />
                  )}
                  {isSelf && (
                    <span className="text-[9px] font-body text-ink-muted bg-canvas-bg px-1.5 py-0.5 rounded-full">
                      you
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

// ── RoomHeader ─────────────────────────────────────────────────────────────────
export const RoomHeader = ({ roomId, onUndo, onRedo }) => {
  const { users, selfUser, connectionStatus } = useWhiteboardStore();
  const [copied, setCopied] = useState(false);

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortId = roomId?.slice(0, 8) ?? '…';

  return (
    <header className="flex items-center justify-between px-3 md:px-4 py-2 md:py-2.5 bg-chalk border-b border-canvas-line shadow-sm z-20 gap-2 min-h-[48px]">

      {/* ── Brand + room ID copy ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0 shrink-0">
        <span className="font-display text-lg md:text-xl text-ink tracking-tight">Board</span>
        <button
          onClick={copyRoomId}
          title={copied ? 'Copied!' : 'Copy room link'}
          className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-canvas-bg rounded-lg border border-canvas-line hover:border-ink/30 transition-colors group"
        >
          <span className="font-mono text-xs text-ink-soft tracking-widest select-all">
            {shortId}…
          </span>
          {copied
            ? <Check size={12} className="text-green-600" />
            : <Copy size={12} className="text-ink-muted group-hover:text-ink transition-colors" />
          }
        </button>
        {/* On very small screens, just a copy icon */}
        <button
          onClick={copyRoomId}
          title={copied ? 'Copied!' : 'Copy room link'}
          className="sm:hidden flex items-center justify-center w-7 h-7 rounded-lg border border-canvas-line hover:bg-ink/6 transition-colors"
        >
          {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} className="text-ink-muted" />}
        </button>
      </div>

      {/* ── Centre: presence + undo/redo ─────────────────────────────────── */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <PresenceCluster users={users} selfUser={selfUser} />
        <div className="w-px h-5 bg-canvas-line shrink-0" />
        <UndoRedo onUndo={onUndo} onRedo={onRedo} />
      </div>

      {/* ── Right: connection status ──────────────────────────────────────── */}
      <StatusDot status={connectionStatus} />
    </header>
  );
};