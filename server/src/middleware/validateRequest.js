/**
 * HTTP request validation middleware.
 *
 * ── Room ID format change (security upgrade) ──────────────────────────────────
 *
 * Old format: ^[A-Z0-9]{1,16}$  (short, uppercase, client-generated, enumerable)
 * New format: UUID v4            (server-generated, 122 bits entropy, non-enumerable)
 *
 * UUID v4 example: 550e8400-e29b-41d4-a716-446655440000
 *
 * The regex enforces strict UUID v4 structure:
 *   - Version nibble is always '4'
 *   - Variant nibble is always 8, 9, a, or b
 * This means only legitimately generated UUIDs pass — not arbitrary 36-char strings.
 */

// UUID v4: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
export const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates req.params.roomId as a strict UUID v4.
 * Returns 400 if the format is wrong.
 * Note: format validity ≠ existence. The controller checks existence separately.
 */
export const validateRoomId = (req, res, next) => {
  const id = req.params.roomId;

  if (typeof id !== 'string' || !UUID_V4_RE.test(id)) {
    return res.status(400).json({
      error:     'Invalid room ID format.',
      field:     'roomId',
      requestId: req.id,
    });
  }

  next();
};

/**
 * Guards the GET /api/rooms listing endpoint in production.
 * Listing all rooms leaks metadata — disable unless an admin token is provided.
 */
export const guardRoomList = (req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) return next();

  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return res.status(403).json({
      error:     'Room listing is disabled in production.',
      requestId: req.id,
    });
  }

  const provided = req.headers['x-admin-token'];
  if (provided !== adminToken) {
    return res.status(403).json({
      error:     'Forbidden.',
      requestId: req.id,
    });
  }

  next();
};