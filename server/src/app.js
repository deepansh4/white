import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import { httpRateLimiter } from './middleware/rateLimiter.js';
import roomRoutes from './routes/roomRoutes.js';

export const createApp = () => {
  const app = express();

  // ── Security headers (Helmet) ───────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        connectSrc:  ["'self'", config.clientUrl],
        scriptSrc:   ["'self'"],
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", 'data:'],
        objectSrc:   ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,  // allow canvas cross-origin image export
  }));

  // ── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = config.clientUrl.split(',').map((s) => s.trim());
  app.use(cors({
    origin(origin, cb) {
      // Allow requests with no origin (e.g. server-to-server health checks)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // ── HTTP Rate limiting ──────────────────────────────────────────────────────
  app.use(httpRateLimiter);

  // ── Logging ─────────────────────────────────────────────────────────────────
  if (config.isDev) app.use(morgan('dev'));

  // ── Body parsing — limit size to prevent oversized payloads ────────────────
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));

  // ── Routes ──────────────────────────────────────────────────────────────────
  app.use('/api/rooms', roomRoutes);

  // Health check — never expose config details in prod
  app.get('/health', (_, res) => res.json({
    status: 'ok',
    ...(config.isDev ? { env: config.nodeEnv } : {}),
  }));

  // ── 404 ─────────────────────────────────────────────────────────────────────
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // ── Global error handler ────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (config.isDev) console.error(err);
    // Never leak stack traces or internals to the client in production
    res.status(err.status || 500).json({
      error: config.isDev ? err.message : 'Internal server error',
    });
  });

  return app;
};