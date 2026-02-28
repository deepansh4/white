# Whiteboard — Real-Time Collaborative Drawing App

A production-ready real-time collaborative whiteboard built with React, Vite, Tailwind CSS, Node.js, Express, and Socket.io.

---

## Architecture Overview

```
whiteboard/
├── server/                    ← Node.js / Express / Socket.io
│   └── src/
│       ├── config/env.js         ← centralised env config
│       ├── app.js                ← Express factory (middlewares, routes)
│       ├── server.js             ← HTTP server + Socket.io boot
│       ├── routes/roomRoutes.js  ← REST endpoints (/api/rooms)
│       ├── controllers/          ← thin REST controllers
│       ├── services/
│       │   └── whiteboardService.js  ← in-memory store (swap → DB)
│       └── socket/
│           ├── socketManager.js  ← Socket.io init + connection lifecycle
│           └── handlers/
│               ├── roomHandler.js    ← join / leave / cursor
│               └── drawingHandler.js ← draw:start/move/end/clear
│
└── client/                    ← React 18 + Vite + Tailwind
    └── src/
        ├── lib/
        │   ├── socket.js     ← singleton Socket.io-client
        │   └── utils.js      ← helpers (cn, generateRoomId, getPointerPos)
        ├── store/
        │   └── useWhiteboardStore.js   ← Zustand global state
        ├── hooks/
        │   ├── useSocket.js  ← manages all socket events ↔ store/canvas
        │   └── useCanvas.js  ← canvas 2D drawing engine
        ├── components/
        │   ├── layout/AppLayout.jsx
        │   └── whiteboard/
        │       ├── Canvas.jsx      ← <canvas> + remote cursors overlay
        │       ├── Toolbar.jsx     ← tool/color/width picker
        │       └── RoomHeader.jsx  ← presence bar + status
        └── pages/
            ├── HomePage.jsx        ← room create / join
            └── WhiteboardPage.jsx  ← main board view
```

---

## Key Architecture Decisions

### Separation of Concerns
- **`whiteboardService`** is a pure data layer — swap the `Map` for MongoDB/Redis with no changes to socket handlers.
- **`useCanvas`** owns all 2D drawing logic; **`useSocket`** owns all network logic. They communicate through a `rendererRef` interface (`replayStrokes`, `remoteDrawStart`, etc.) — neither depends on the other's internals.
- **`useWhiteboardStore`** (Zustand) holds shared UI state; no prop drilling needed.

### Socket Event Design
```
room:join       → server joins Socket.io room, sends synced state back
room:synced     → client gets full stroke history + user list on join
draw:start/move → live broadcast (not persisted) for smooth streaming
draw:end        → persisted stroke with full point array
draw:clear      → broadcast + clear server state
cursor:move     → ephemeral, not persisted
```

### Scalability Hooks
- **Multiple rooms**: Each room has isolated state in `whiteboardService`. Socket.io rooms handle broadcast scoping.
- **Auth-ready**: `user` objects are already structured with `id`, `username`, `color`. Replace `socket.id` with JWT sub.
- **DB-ready**: `whiteboardService` interface is the contract. Implement `MongoWhiteboardService` satisfying the same methods and swap in `socketManager.js`.
- **Horizontal scaling**: Add `socket.io-redis` adapter and plug into `initSocketServer` — one line change.

---

## Setup Instructions

### Prerequisites
- Node.js ≥ 20 LTS
- npm ≥ 9

### 1. Clone & install
```bash
git clone <repo-url>
cd whiteboard

# Install root + both workspaces
npm run install:all
```

### 2. Configure environment
```bash
# Server
cp server/.env.example server/.env

# Client
cp client/.env.example client/.env
```

Edit `server/.env`:
```
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

### 3. Run in development
```bash
# Both server + client with hot-reload
npm run dev
```

Or individually:
```bash
npm run dev:server   # nodemon on :3001
npm run dev:client   # Vite HMR on :5173
```

### 4. Open
Navigate to **http://localhost:5173**, enter a name, and create or join a board. Open a second tab with the same room code to see real-time sync.

---

## REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |
| GET | `/api/rooms` | List all active rooms |
| GET | `/api/rooms/:roomId` | Get room metadata |

---

## Socket Events Reference

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `room:join` | client→server | `{roomId, username}` | Join a room |
| `room:synced` | server→client | `{strokes, users, self}` | Initial sync on join |
| `room:user_joined` | server→peers | `{user, users}` | New peer joined |
| `room:user_left` | server→peers | `{userId, users}` | Peer left |
| `draw:start` | client→server | `{points, tool, color, lineWidth, opacity}` | Begin stroke |
| `draw:move` | client→server | `{point}` | Add point |
| `draw:end` | client→server | `{points, tool, color, lineWidth, opacity}` | Commit stroke |
| `draw:clear` | client→server | — | Clear board |
| `cursor:move` | client→server | `{x, y}` | Cursor position |

---

## Production Build

```bash
npm run build:client          # outputs to client/dist/
# Serve client/dist with nginx or any static host
# Deploy server/ to any Node.js PaaS (Railway, Render, Fly.io)
```

---

## Extending the App

