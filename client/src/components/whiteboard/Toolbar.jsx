import React from 'react';
import {
  Pen, Eraser, Minus, Square, Circle, Trash2, Download,
} from 'lucide-react';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';
import { cn } from '@/lib/utils';

const TOOLS = [
  { id: 'pen',    icon: Pen,    label: 'Pen (P)'         },
  { id: 'eraser', icon: Eraser, label: 'Eraser (E)'      },
  { id: 'line',   icon: Minus,  label: 'Line (L)'        },
  { id: 'rect',   icon: Square, label: 'Rectangle (R)'   },
  { id: 'circle', icon: Circle, label: 'Circle (C)'      },
];

const PALETTE = [
  '#1A1814','#C8502A','#2E7D5E','#1D5FA6',
  '#8B3FA8','#D4A017','#E8735A','#4A90D9',
];

const WIDTHS = [2, 4, 8, 14, 22];

const ToolButton = ({ icon: Icon, label, active, onClick }) => (
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
    <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
    <span className="absolute left-full ml-2 px-2 py-1 text-xs font-body bg-board text-chalk rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
      {label}
    </span>
  </button>
);

export const Toolbar = ({ onClear, onDownload }) => {
  const {
    tool, color, lineWidth,
    setTool, setColor, setLineWidth,
  } = useWhiteboardStore();

  return (
    <div className="flex flex-col items-center gap-1 p-2 bg-chalk rounded-2xl shadow-panel border border-canvas-line">

      {/* ── Drawing tools ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5">
        {TOOLS.map((t) => (
          <ToolButton
            key={t.id}
            icon={t.icon}
            label={t.label}
            active={tool === t.id}
            onClick={() => setTool(t.id)}
          />
        ))}
      </div>

      <div className="w-6 h-px bg-canvas-line my-1" />

      {/* ── Color palette ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-1 px-0.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn(
              'w-4 h-4 rounded-full ring-offset-chalk transition-transform duration-100',
              color === c
                ? 'ring-2 ring-ink ring-offset-2 scale-110'
                : 'hover:scale-110',
            )}
            style={{ background: c }}
            title={c}
          />
        ))}
      </div>

      {/* Custom colour picker */}
      <div className="relative mt-1">
        <div
          className="w-8 h-8 rounded-lg border-2 border-canvas-line overflow-hidden"
          style={{ background: color }}
        >
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
            title="Custom color"
          />
        </div>
      </div>

      <div className="w-6 h-px bg-canvas-line my-1" />

      {/* ── Stroke widths (hidden when eraser active – slider takes over) ──── */}
      {tool !== 'eraser' && (
        <div className="flex flex-col items-center gap-2 py-1">
          {WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setLineWidth(w)}
              className={cn(
                'flex items-center justify-center w-8 h-5 rounded transition-all',
                lineWidth === w ? 'bg-ink/10' : 'hover:bg-ink/5',
              )}
              title={`${w}px`}
            >
              <div
                className="rounded-full bg-ink transition-all"
                style={{ width: Math.min(w * 1.5, 24), height: w }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Eraser active — show a small reminder label in the size slot */}
      {tool === 'eraser' && (
        <div className="flex flex-col items-center gap-1 py-2">
          <Eraser size={14} className="text-ink-muted" strokeWidth={1.5} />
          <span className="text-[10px] font-body text-ink-muted text-center leading-tight">
            size<br/>above ↑
          </span>
        </div>
      )}

      <div className="w-6 h-px bg-canvas-line my-1" />

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <button
        onClick={onClear}
        title="Clear board"
        className="flex items-center justify-center w-10 h-10 rounded-lg text-accent hover:bg-accent-light transition-colors"
      >
        <Trash2 size={18} strokeWidth={1.8} />
      </button>

      <button
        onClick={onDownload}
        title="Download PNG"
        className="flex items-center justify-center w-10 h-10 rounded-lg text-ink-soft hover:bg-ink/8 hover:text-ink transition-colors"
      >
        <Download size={18} strokeWidth={1.8} />
      </button>
    </div>
  );
};