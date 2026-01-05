import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { Request, Response } from 'express';
import http from 'http';
import https from 'https';
import { config } from './config';

export function createProxy() {
  // Determine if upstream is HTTPS
  const isHttps = config.proxy.upstreamUrl.startsWith('https://');

  const proxyOptions: Options = {
    target: config.proxy.upstreamUrl,
    changeOrigin: true,
    ws: true, // Enable WebSocket support for GraphQL subscriptions
    timeout: config.proxy.timeout,
    proxyTimeout: config.proxy.timeout,
    // Enable HTTP keep-alive for connection reuse
    agent: config.proxy.keepAlive
      ? isHttps
        ? new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: 50,
            maxFreeSockets: 10,
          })
        : new http.Agent({
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: 50,
            maxFreeSockets: 10,
          })
      : undefined,
    // Preserve original headers
    onProxyReq: (proxyReq, req: Request) => {
      // Preserve original host header info
      const originalHost = req.get('host');
      if (originalHost) {
        proxyReq.setHeader('X-Forwarded-Host', originalHost);
      }

      // Add forwarded headers
      const clientIp =
        req.get('X-Forwarded-For') || req.ip || req.socket.remoteAddress;
      if (clientIp) {
        proxyReq.setHeader('X-Forwarded-For', clientIp);
      }

      const protocol = req.get('X-Forwarded-Proto') || req.protocol;
      proxyReq.setHeader('X-Forwarded-Proto', protocol);

      // Preserve correlation ID if present
      const correlationId = req.get('X-Correlation-ID');
      if (correlationId) {
        proxyReq.setHeader('X-Correlation-ID', correlationId);
      }

      // Log proxy request (optional, can be removed for minimal overhead)
      if (config.server.nodeEnv === 'development') {
        console.log(
          `[PROXY] ${req.method} ${req.path} -> ${config.proxy.upstreamUrl}${req.path}`
        );
      }
    },
    // Preserve response headers
    onProxyRes: (proxyRes, req: Request, res: Response) => {
      // Preserve all response headers
      // The proxy middleware handles this automatically, but we can add custom logic here if needed

      // Log proxy response (optional)
      if (config.server.nodeEnv === 'development') {
        console.log(
          `[PROXY] ${req.method} ${req.path} <- ${proxyRes.statusCode}`
        );
      }
    },
    // Error handling
    onError: (err: Error, req: Request, res: Response) => {
      console.error('[PROXY ERROR]', {
        error: err.message,
        path: req.path,
        method: req.method,
      });

      if (!res.headersSent) {
        res.status(502).json({
          error: 'Bad Gateway',
          message: 'Failed to connect to upstream server',
          upstream: config.proxy.upstreamUrl,
        });
      }
    },
    // Handle timeout
    onTimeout: (req: Request, res: Response) => {
      console.error('[PROXY TIMEOUT]', {
        path: req.path,
        method: req.method,
        timeout: config.proxy.timeout,
      });

      if (!res.headersSent) {
        res.status(504).json({
          error: 'Gateway Timeout',
          message: 'Request to upstream server timed out',
          timeout: config.proxy.timeout,
        });
      }
    },
  };

  return createProxyMiddleware(proxyOptions);
}

