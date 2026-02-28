import { createServer } from 'http';
import { createApp } from './app.js';
import { initSocketServer } from './socket/socketManager.js';
import { config } from './config/env.js';

const app = createApp();
const httpServer = createServer(app);
initSocketServer(httpServer);

httpServer.listen(config.port, () => {
  console.log(`🚀 Server running on http://localhost:${config.port} [${config.nodeEnv}]`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received – shutting down gracefully');
  httpServer.close(() => process.exit(0));
});
