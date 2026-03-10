import { create } from 'zustand';

export const useWhiteboardStore = create((set) => ({

  // ── Tool config ──────────────────────────────────────────────────────────────
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

  // ── Collaborative history ────────────────────────────────────────────────────
  canUndo: false,
  canRedo: false,
  setHistoryState: ({ canUndo, canRedo }) => set({ canUndo, canRedo }),

  // ── Room / presence ──────────────────────────────────────────────────────────
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

  // ── Room error ───────────────────────────────────────────────────────────────
  roomError:      null,
  setRoomError:   (code) => set({ roomError: code }),
  clearRoomError: ()     => set({ roomError: null }),

  // ── Remote cursors ───────────────────────────────────────────────────────────
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