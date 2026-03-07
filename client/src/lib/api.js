/**
 * API client — thin wrapper over fetch() for the whiteboard REST API.
 *
 * The base URL is the same server that handles WebSocket connections:
 * VITE_SOCKET_URL (falls back to http://localhost:3001 in development).
 *
 * Why use the full URL instead of the Vite proxy (/api/...)?
 * The Vite proxy only works in dev. Using the full URL works in both
 * environments without any change.
 *
 * Security note: no user-supplied data is interpolated into the base URL.
 * VITE_SOCKET_URL is validated at socket connection time (see lib/socket.js).
 */

const API_BASE = (import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001').replace(/\/$/, '');

/**
 * POST /api/rooms
 *
 * Asks the server to create a new room and return its UUID.
 * The client NEVER generates room IDs — this is the only valid origin of one.
 *
 * @returns {Promise<string>} The new UUID v4 room ID
 * @throws  {Error}          On network failure or non-201 response
 */
export const createRoom = async () => {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/rooms`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (networkErr) {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 429) {
    throw new Error('Too many rooms created. Please wait a moment and try again.');
  }

  if (!res.ok) {
    throw new Error(`Server error (${res.status}). Please try again.`);
  }

  const body = await res.json();

  // Validate the response contains the expected field
  if (typeof body?.roomId !== 'string' || !body.roomId) {
    throw new Error('Unexpected server response when creating room.');
  }

  return body.roomId;
};