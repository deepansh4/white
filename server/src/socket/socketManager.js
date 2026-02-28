import { Server } from 'socket.io';
import { config } from '../config/env.js';
import { registerRoomHandlers }    from './handlers/roomHandler.js';
import { registerDrawingHandlers } from './handlers/drawingHandler.js';

/**
 * Recursively strips prototype-polluting keys from any object received over
 * the wire. Defends against __proto__, constructor, and prototype injection.
 *
 * Uses Object.create(null) so the result has no inherited properties at all.
 */
const deepSanitize = (value) => {
  if (Array.isArray(value)) return value.map(deepSanitize);
  if (value !== null && typeof value === 'object') {
    const safe = Object.create(null);
    for (const [k, v] of Object.entries(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      safe[k] = deepSanitize(v);
    }
    return safe;
  }
  return value;
};

/** Set of valid client → server events. Unknown events are logged and dropped. */
const KNOWN_EVENTS = new Set([
  'room:join', 'room:leave',
  'cursor:move',
  'draw:start', 'draw:move', 'draw:end', 'draw:clear',
  'draw:undo', 'draw:redo',
  // socket.io internals
  'ping', 'pong', 'error', 'disconnect', 'disconnecting', 'connect',
]);

export const initSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin:  config.clientUrl,
      methods: ['GET', 'POST'],
    },
    // Reject events larger than 2 MB — prevents oversized payload DoS
    maxHttpBufferSize: 2e6,
    pingTimeout:    60_000,
    pingInterval:   25_000,
    connectTimeout: 10_000,
  });

  // ── Global socket middleware ──────────────────────────────────────────────────

  /**
   * Prototype-pollution guard — runs before any event handler.
   * Every payload is deep-sanitized so no handler ever sees a poisoned object.
   */
  io.use((socket, next) => {
    socket.use(([_event, ...args], next) => {
      const sanitized = args.map(deepSanitize);
      args.splice(0, args.length, ...sanitized);
      next();
    });
    next();
  });

  /**
   * Future auth hook — uncomment and implement when adding JWT authentication.
   *
   * io.use((socket, next) => {
   *   const token = socket.handshake.auth?.token;
   *   if (!token) return next(new Error('Unauthorized'));
   *   try {
   *     socket.data.user = verifyJwt(token);  // throws on invalid token
   *     next();
   *   } catch {
   *     next(new Error('Invalid token'));
   *   }
   * });
   */

  io.on('connection', (socket) => {
    if (config.isDev) console.log(`[socket] + ${socket.id}`);

    // Register handlers
    registerRoomHandlers(io, socket);

    // Lazy roomId getter — resolved at event time after room:join
    const getRoomId = () =>
      [...socket.rooms].find((r) => r !== socket.id) ?? null;

    registerDrawingHandlers(io, socket, getRoomId);

    // ── Unknown-event guard ───────────────────────────────────────────────────
    // Silently drops unknown events (no error sent — don't expose event list).
    socket.onAny((event) => {
      if (!KNOWN_EVENTS.has(event) && config.isDev) {
        console.warn(`[socket] unknown event "${event}" from ${socket.id}`);
      }
    });

    socket.on('disconnect', (reason) => {
      if (config.isDev) console.log(`[socket] - ${socket.id} (${reason})`);
    });
  });

  return io;
};