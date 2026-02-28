import React from 'react';
import { Eraser } from 'lucide-react';
import { useWhiteboardStore } from '@/store/useWhiteboardStore';

/**
 * Floating eraser-size panel.
 * Mounts into the DOM always but uses CSS translate/opacity so the animation
 * is GPU-composited and doesn't cause layout shifts.
 */
export const EraserSizeSlider = () => {
  const { tool, eraserSize, setEraserSize } = useWhiteboardStore();
  const visible = tool === 'eraser';

  return (
    <div
      className="pointer-events-none absolute top-3 left-1/2 z-40"
      style={{ transform: 'translateX(-50%)' }}
    >
      <div
        className="pointer-events-auto flex items-center gap-3 px-4 py-2.5
                   bg-chalk border border-canvas-line rounded-2xl shadow-float
                   transition-all duration-200 ease-out"
        style={{
          opacity:   visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.95)',
          pointerEvents: visible ? 'auto' : 'none',
        }}
      >
        {/* Small eraser preview circle */}
        <Eraser size={14} className="text-ink-muted shrink-0" strokeWidth={1.8} />

        <span className="text-xs font-body text-ink-muted whitespace-nowrap">Eraser size</span>

        <input
          type="range"
          min={6}
          max={80}
          step={2}
          value={eraserSize}
          onChange={(e) => setEraserSize(Number(e.target.value))}
          className="w-32 accent-ink h-1.5 rounded-full cursor-pointer"
          style={{ accentColor: '#1A1814' }}
        />

        {/* Live size preview bubble */}
        <div className="flex items-center justify-center shrink-0"
             style={{ width: 28, height: 28 }}>
          <div
            className="rounded-full border-2 border-ink-soft bg-ink/10 transition-all duration-75"
            style={{
              width:  Math.max(4, Math.min(eraserSize, 26)),
              height: Math.max(4, Math.min(eraserSize, 26)),
            }}
          />
        </div>

        <span className="text-xs font-mono text-ink-muted w-6 text-right">{eraserSize}</span>
      </div>
    </div>
  );
};