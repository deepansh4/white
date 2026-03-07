import { randomUUID } from 'crypto';

/**
 * Request-ID middleware.
 *
 * Attaches a unique ID to every HTTP request so that log lines, error
 * responses, and downstream service calls can be correlated in production.
 *
 * Strategy (priority order):
 *   1. Use X-Request-ID header if the load balancer/proxy already set one
 *      (validates format to prevent header injection)
 *   2. Generate a fresh UUID v4
 *
 * The ID is:
 *   • Stored on req.id for use by controllers / error handlers
 *   • Reflected back in the X-Request-ID response header so clients can
 *     include it in support tickets
 */

const SAFE_ID_RE = /^[a-zA-Z0-9\-_]{8,64}$/;

export const requestId = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.id = (typeof incoming === 'string' && SAFE_ID_RE.test(incoming))
    ? incoming
    : randomUUID();

  res.setHeader('X-Request-ID', req.id);
  next();
};