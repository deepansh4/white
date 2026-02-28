import { config } from '../../config/env.js';

/**
 * Per-socket token-bucket rate limiter.
 *
 * Only two event categories are rate-limited:
 *
 *   cursor  — cursor:move (cosmetic, can safely lag or drop)
 *
 *   action  — draw:undo, draw:redo, draw:clear
 *             History-mutating operations. Deliberately low cap.
 *
 * Drawing events (draw:start, draw:move, draw:end) are NOT rate-limited.
 * Every draw:move point is required for smooth bezier rendering on remote
 * peers — dropping any point creates a visible gap. Zod validation already
 * bounds payload size and coordinate ranges, which is sufficient protection.
 */
export const createSocketRateLimiter = () => {
  const { cursorEventsPerSecond, actionEventsPerSecond } = config.socketRateLimit;

  const buckets = {
    cursor: {
      tokens:     cursorEventsPerSecond,
      max:        cursorEventsPerSecond,
      refillRate: cursorEventsPerSecond,
    },
    action: {
      tokens:     actionEventsPerSecond,
      max:        actionEventsPerSecond,
      refillRate: actionEventsPerSecond,
    },
  };

  let warnedBuckets = new Set();

  const interval = setInterval(() => {
    for (const b of Object.values(buckets)) {
      b.tokens = Math.min(b.max, b.tokens + b.refillRate);
    }
    warnedBuckets.clear();
  }, 1000);

  if (interval.unref) interval.unref();

  return {
    check(bucket) {
      const b = buckets[bucket];
      if (!b) return true; // unknown bucket → allow

      if (b.tokens > 0) {
        b.tokens -= 1;
        return true;
      }

      if (config.isDev && !warnedBuckets.has(bucket)) {
        warnedBuckets.add(bucket);
        console.warn(`[rate-limit] "${bucket}" bucket exhausted`);
      }
      return false;
    },

    destroy() { clearInterval(interval); },
  };
};