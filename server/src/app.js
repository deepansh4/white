import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { httpRateLimiter } from './middleware/rateLimiter.js';
import roomRoutes from './routes/roomRoutes.js';

export const createApp = () => {
  const app = express();

  // ── Request ID ───────────────────────────────────────────────────────────────
  app.use(requestId);

  // ── Security headers ─────────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:              ["'self'"],
        connectSrc:              ["'self'", ...config.clientUrl.split(',').map(s => s.trim())],
        scriptSrc:               ["'self'"],
        styleSrc:                ["'self'", "'unsafe-inline'"],
        imgSrc:                  ["'self'", 'data:'],
        fontSrc:                 ["'self'", 'data:'],
        objectSrc:               ["'none'"],
        frameSrc:                ["'none'"],
        baseUri:                 ["'self'"],
        formAction:              ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,   // needed for canvas PNG export
    frameguard:                { action: 'deny' },
    noSniff:                   true,
    hsts:                      { maxAge: 31_536_000, includeSubDomains: true, preload: true },
  }));

  // ── CORS ─────────────────────────────────────────────────────────────────────
  const allowedOrigins = new Set(
    config.clientUrl.split(',').map((s) => s.trim()).filter(Boolean),
  );

  app.use(cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      cb(Object.assign(new Error('CORS policy violation'), { status: 403 }));
    },
    credentials:    true,
    methods:        ['GET', 'POST'],      // POST required for room creation
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Admin-Token'],
    exposedHeaders: ['X-Request-ID'],
  }));

  // ── Global HTTP rate limiting ─────────────────────────────────────────────────
  app.use(httpRateLimiter);

  // ── Logging ──────────────────────────────────────────────────────────────────
  if (config.isDev) {
    morgan.token('id', (req) => req.id);
    app.use(morgan(':id :method :url :status :response-time ms'));
  }

  // ── Body parsing ─────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));

  // ── Routes ───────────────────────────────────────────────────────────────────
  app.use('/api/rooms', roomRoutes);

  // Health check — no env details in production
  app.get('/health', (_, res) =>
    res.json({ status: 'ok', ...(config.isDev ? { env: config.nodeEnv } : {}) }),
  );

  // ── 404 ──────────────────────────────────────────────────────────────────────
  app.use((req, res) =>
    res.status(404).json({ error: 'Not found.', requestId: req.id }),
  );

  // ── Global error handler ─────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    console.error(`[${req.id}] ${status} ${err.message}`);
    res.status(status).json({
      error:     config.isDev ? err.message : 'Internal server error.',
      requestId: req.id,
    });
  });

  return app;
};