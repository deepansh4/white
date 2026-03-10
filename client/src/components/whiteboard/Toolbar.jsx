import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Pen, Eraser, Minus, Square, Circle, Trash2, Download,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────
// How long to wait before sliding the toolbar away.
// IDLE  = after mount with no pointer interaction (gives the user a chance to
//         notice the toolbar and learn it exists before it disappears).
// LEAVE = after the pointer exits the toolbar panel (shorter — the user has
//         already discovered the toolbar and is actively drawing).
const HIDE_DELAY_IDLE  = 4_500;   // ms
const HIDE_DELAY_LEAVE = 3_000;   // ms

const TOOLS = [
  { id: 'pen',    icon: Pen,    label: 'Pen (P)'         },
  { id: 'eraser', icon: Eraser, label: 'Eraser (E)'      },
  { id: 'line',   icon: Minus,  label: 'Line (L)'        },
  { id: 'rect',   icon: Square, label: 'Rectangle (R)'   },
  { id: 'circle', icon: Circle, label: 'Circle (C)'      },
];

const PALETTE = [
  '#1A1814', '#C8502A', '#2E7D5E', '#1D5FA6',
  '#8B3FA8', '#D4A017', '#E8735A', '#4A90D9',
];

const WIDTHS = [2, 4, 8, 14, 22];

// ── ToolBtn ────────────────────────────────────────────────────────────────────
const ToolBtn = ({ icon: Icon, label, active, onClick }) => (
  <button
    title={label}
    onClick={onClick}
    className={cn(
      'relative group flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150',
      active
        ? 'bg-ink text-chalk shadow-inner'
        : 'text-ink-soft hover:bg-ink/8 hover:text-ink',
    )}
  >
    <Icon size={17} strokeWidth={active ? 2.5 : 1.8} />

    {/* Tooltip — floats to the right of each button */}
    <span className="absolute left-full ml-3 px-2 py-1 text-xs font-body bg-board text-chalk rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-[70] transition-opacity duration-100 shadow-lg">
      {label}
    </span>
  </button>
);

const Divider = () => (
  <div className="h-px w-6 bg-canvas-line my-1.5 shrink-0 self-center" />
);

// ── ToolbarContent — pure rendering, no drawer logic ──────────────────────────
const ToolbarContent = ({ onClear, onDownload }) => {
  const { tool, color, lineWidth, setTool, setColor, setLineWidth } = useWhiteboardStore();

  return (
    <div className="flex flex-col items-center gap-0.5 py-3 px-2">

      {/* ── Drawing tools ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5">
        {TOOLS.map(t => (
          <ToolBtn
            key={t.id}
            icon={t.icon}
            label={t.label}
            active={tool === t.id}
            onClick={() => setTool(t.id)}
          />
        ))}
      </div>

      <Divider />

      {/* ── Color palette ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-1 px-0.5">
        {PALETTE.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            title={c}
            className={cn(
              'w-4 h-4 rounded-full ring-offset-chalk transition-transform duration-100',
              color === c
                ? 'ring-2 ring-ink ring-offset-2 scale-110'
                : 'hover:scale-110',
            )}
            style={{ background: c }}
          />
        ))}
      </div>

      {/* Custom colour picker */}
      <div className="relative mt-1.5">
        <div
          className="w-8 h-8 rounded-lg border-2 border-canvas-line overflow-hidden"
          style={{ background: color }}
          title="Custom color"
        >
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
          />
        </div>
      </div>

      <Divider />

      {/* ── Stroke widths ──────────────────────────────────────────────── */}
      {tool !== 'eraser' ? (
        <div className="flex flex-col items-center gap-1.5 py-1">
          {WIDTHS.map(w => (
            <button
              key={w}
              onClick={() => setLineWidth(w)}
              title={`${w}px`}
              className={cn(
                'flex items-center justify-center w-8 h-5 rounded transition-all',
                lineWidth === w ? 'bg-ink/10' : 'hover:bg-ink/5',
              )}
            >
              <div
                className="rounded-full bg-ink transition-all"
                style={{ width: Math.min(w * 1.5, 24), height: w }}
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 py-2">
          <Eraser size={13} className="text-ink-muted" strokeWidth={1.5} />
          <span className="text-[9px] font-body text-ink-muted text-center leading-tight">
            size{'\n'}above ↑
          </span>
        </div>
      )}

      <Divider />

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5">
        <button
          onClick={onClear}
          title="Clear board"
          className="flex items-center justify-center w-10 h-10 rounded-lg text-accent hover:bg-accent-light transition-colors"
        >
          <Trash2 size={17} strokeWidth={1.8} />
        </button>
        <button
          onClick={onDownload}
          title="Download PNG"
          className="flex items-center justify-center w-10 h-10 rounded-lg text-ink-soft hover:bg-ink/8 hover:text-ink transition-colors"
        >
          <Download size={17} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
};

// ── Toolbar — drawer wrapper ────────────────────────────────────────────────────
//
// Layout geometry (important for understanding the translateX math):
//
//   When VISIBLE:   [  panel  ][tab]   — panel flush with left edge
//   When HIDDEN:                [tab]  — panel translated off-screen left
//
// The sliding div's CSS width = panel width (the tab is absolutely positioned
// outside so it doesn't contribute to intrinsic width).
//
// translateX(-100%) moves the div left by exactly its own width, which brings
// the panel off-screen while keeping the tab pinned at the viewport left edge:
//
//   tab.leftEdge = slidingDiv.rightEdge - tabWidth + tabWidth = 0px  ✓
//
// The outer wrapper is pointer-events-none to let canvas events pass through
// the empty space. The panel and tab re-enable pointer-events individually.
//
export const Toolbar = ({ onClear, onDownload }) => {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  // Start a countdown to hide the toolbar
  const scheduleHide = useCallback((delay) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), delay);
  }, []);

  // Cancel a pending hide (called when pointer enters the panel)
  const cancelHide = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  // Auto-hide after the idle grace period on first mount
  useEffect(() => {
    scheduleHide(HIDE_DELAY_IDLE);
    return () => clearTimeout(timerRef.current);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle: if hidden → show + start leave-delay; if visible → hide immediately
  const toggle = useCallback(() => {
    setVisible(prev => {
      clearTimeout(timerRef.current);
      if (!prev) {
        // Opening: schedule auto-hide so the toolbar doesn't stay open forever
        timerRef.current = setTimeout(() => setVisible(false), HIDE_DELAY_LEAVE);
        return true;
      }
      // Closing: no timer needed
      return false;
    });
  }, []);

  const onPanelEnter = useCallback(() => cancelHide(),                             [cancelHide]);
  const onPanelLeave = useCallback(() => scheduleHide(HIDE_DELAY_LEAVE),           [scheduleHide]);

  return (
    // Full-height column on the left; pointer-events-none so the canvas receives
    // events in the empty space that the (hidden) panel used to occupy.
    <div className="absolute left-0 top-0 bottom-0 z-30 pointer-events-none flex items-center">

      {/* Sliding container — translateX(-100%) slides panel fully off-screen */}
      <div
        className="relative flex items-center transition-transform duration-300 ease-out will-change-transform"
        style={{ transform: visible ? 'translateX(0)' : 'translateX(-100%)' }}
      >

        {/* ── Panel ──────────────────────────────────────────────────────── */}
        {/*
          border-t/r/b (no left border — flush with the viewport edge).
          rounded-r-2xl gives a friendly pill shape on the right side.
          overflow-y-auto + max-h ensures it scrolls on very short screens
          without overflowing the header area (56 px = header min-height + gap).
          The custom scrollbar styles use Tailwind v3 arbitrary variants.
        */}
        <div
          className={cn(
            'pointer-events-auto',
            'bg-chalk border-t border-r border-b border-canvas-line rounded-r-2xl shadow-panel',
            'overflow-y-auto',
            // Thin scrollbar (webkit-only; Firefox falls back to thin native bar)
            '[&::-webkit-scrollbar]:w-1',
            '[&::-webkit-scrollbar-track]:bg-transparent',
            '[&::-webkit-scrollbar-thumb]:rounded-full',
            '[&::-webkit-scrollbar-thumb]:bg-canvas-line',
          )}
          style={{ maxHeight: 'calc(100dvh - 56px)' }}
          onPointerEnter={onPanelEnter}
          onPointerLeave={onPanelLeave}
        >
          <ToolbarContent onClear={onClear} onDownload={onDownload} />
        </div>

        {/* ── Toggle tab ─────────────────────────────────────────────────── */}
        {/*
          Absolutely positioned at -right-8 (32 px to the right of the panel).
          Because it's outside the sliding div's natural width, translateX(-100%)
          on the parent moves it to x=0 (viewport left edge) when the panel
          is hidden — always tappable and never off-screen.
        */}
        <button
          onClick={toggle}
          onPointerDown={e => e.stopPropagation()}   // prevent canvas pointer-down
          title={visible ? 'Hide toolbar' : 'Show toolbar'}
          aria-label={visible ? 'Hide toolbar' : 'Show toolbar'}
          aria-expanded={visible}
          className={cn(
            'pointer-events-auto',
            'absolute -right-8 top-1/2 -translate-y-1/2',
            'w-8 h-12',
            'bg-chalk border-t border-r border-b border-canvas-line rounded-r-xl shadow-tool',
            'flex items-center justify-center',
            'text-ink-muted hover:text-ink hover:bg-ink/6',
            'transition-colors duration-150',
            // Subtle left edge separator between tab and panel
            'border-l border-l-canvas-line/50',
          )}
        >
          {visible
            ? <ChevronLeft  size={14} strokeWidth={2.2} />
            : <ChevronRight size={14} strokeWidth={2.2} />
          }
        </button>

      </div>
    </div>
  );
};