import express, { Request, Response } from 'express';
import { config } from './config';
import { createProxy } from './proxy';

const app = express();

// Minimal middleware - no body parsing for pass-through
// Only parse JSON for health check endpoint
app.use(express.json({ limit: '1kb' }));

// Health check endpoint (for proxy itself)
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'api-proxy',
    upstream: config.proxy.upstreamUrl,
    timestamp: new Date().toISOString(),
  });
});

// Create proxy middleware
const proxy = createProxy();

// Proxy all other requests to upstream
app.use('/', proxy);

// Error handling middleware
app.use(
  (
    err: Error,
    _req: Request,
    res: Response,
    _next: express.NextFunction
  ) => {
    console.error('[SERVER ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    }
  }
);

// Start server
const server = app.listen(config.server.port, () => {
  console.log(`\n🚀 Proxy server started successfully`);
  console.log(`   Port: ${config.server.port}`);
  console.log(`   Environment: ${config.server.nodeEnv}`);
  console.log(`   Upstream: ${config.proxy.upstreamUrl}`);
  console.log(`   Keep-Alive: ${config.proxy.keepAlive}`);
  console.log(`   Timeout: ${config.proxy.timeout}ms\n`);
});

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down proxy server...');

  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('✅ Proxy server shutdown complete');
      resolve();
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.log('⚠️  Forcing shutdown...');
      process.exit(1);
    }, 10000);
  });
}

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
  shutdown().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[UNHANDLED REJECTION]', reason);
  shutdown().then(() => process.exit(1));
});

