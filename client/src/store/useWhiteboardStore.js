import { create } from 'zustand';

/**
 * Central Zustand store.
 *
 * History state (canUndo / canRedo) is now SHARED and server-authoritative.
 * The server broadcasts `history:state` to ALL room members after every
 * undo/redo/stroke/clear so every client's buttons stay perfectly in sync.
 */
export const useWhiteboardStore = create((set) => ({

  // ── Tool config ─────────────────────────────────────────────────────────────
  tool:       'pen',
  color:      '#1A1814',
  lineWidth:  3,
  opacity:    1,
  eraserSize: 24,

  setTool:       (tool)       => set({ tool }),
  setColor:      (color)      => set({ color }),
  setLineWidth:  (lineWidth)  => set({ lineWidth }),
  setOpacity:    (opacity)    => set({ opacity }),
  setEraserSize: (eraserSize) => set({ eraserSize }),

  // ── Shared collaborative history state ──────────────────────────────────────
  // Updated exclusively via `history:state` socket event from the server.
  // All connected users see the same values — no optimistic local state.
  canUndo: false,
  canRedo: false,
  setHistoryState: ({ canUndo, canRedo }) => set({ canUndo, canRedo }),

  // ── Room / presence ─────────────────────────────────────────────────────────
  roomId:           null,
  username:         '',
  selfUser:         null,
  users:            [],
  connectionStatus: 'idle',

  setRoomId:           (roomId)           => set({ roomId }),
  setUsername:         (username)         => set({ username }),
  setSelfUser:         (selfUser)         => set({ selfUser }),
  setUsers:            (users)            => set({ users }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  // ── Remote cursors ─────────────────────────────────────────────────────────
  cursors: {},

  updateCursor: (userId, data) =>
    set((s) => ({ cursors: { ...s.cursors, [userId]: data } })),

  removeCursor: (userId) =>
    set((s) => {
      const c = { ...s.cursors };
      delete c[userId];
      return { cursors: c };
    }),
}));