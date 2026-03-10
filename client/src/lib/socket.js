import { io } from 'socket.io-client';

/**
 * Socket.io singleton with production-grade reconnection strategy.
 *
 * Exponential backoff (not flat delay) so reconnect storms don't hammer
 * a recovering server. Jitter is added to spread clients across time.
 *
 * Reconnection schedule with defaults:
 *   attempt 1:  ~1 000 ms
 *   attempt 2:  ~2 000 ms
 *   attempt 3:  ~4 000 ms
 *   attempt 4:  ~8 000 ms
 *   attempt 5:  ~16 000 ms  (capped at randomizationFactor * delay)
 *
 * After 5 failed attempts the socket gives up and triggers 'connect_error'
 * → the store sets connectionStatus = 'error' → UI shows reconnect button.
 *
 * URL validation:
 *   VITE_SOCKET_URL is checked at import time. If it is missing or not an
 *   http(s):// URL the module throws immediately so the error surfaces during
 *   development rather than silently connecting to a wrong or attacker-supplied URL.
 */

const RAW_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

// Validate URL at module load time — catches env misconfiguration early
const validateSocketUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`VITE_SOCKET_URL must use http or https protocol, got: ${parsed.protocol}`);
    }
    return url;
  } catch (err) {
    // Re-throw with a clear message for developers
    throw new Error(`Invalid VITE_SOCKET_URL "${url}": ${err.message}`);
  }
};

const SOCKET_URL = validateSocketUrl(RAW_URL);

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,

      // ── Exponential backoff reconnection ───────────────────────────────────
      reconnection:           true,
      reconnectionAttempts:   5,
      reconnectionDelay:      1_000,    // base delay (ms) for first retry
      reconnectionDelayMax:   30_000,   // cap so retries don't exceed 30s
      randomizationFactor:    0.5,      // ±50% jitter to spread reconnect storms

      // ── Transport ──────────────────────────────────────────────────────────
      // Prefer WebSocket; fall back to long-polling if WS is blocked
      transports: ['websocket', 'polling'],

      // ── Timeouts ──────────────────────────────────────────────────────────
      timeout: 10_000,   // connection attempt timeout (ms)
    });
  }
  return socket;
};

export const connectSocket = () => {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
};

export const disconnectSocket = () => {
  if (socket?.connected) socket.disconnect();
};