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
    ws: true, // Enable WebSocket support (if needed in future)
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

      // Preserve API key header (x-api-key or api-key query param)
      const apiKey = req.get('x-api-key') || req.query['api-key'];
      if (apiKey) {
        proxyReq.setHeader('x-api-key', apiKey as string);
      }

      // If body was parsed by Express (e.g., express.json()), write it to proxy request
      // This is necessary because http-proxy-middleware reads from the request stream,
      // which has already been consumed by the body parser
      if (req.body && Object.keys(req.body).length > 0) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }

      // Log proxy request (optional, can be removed for minimal overhead)
      if (config.server.nodeEnv === 'development') {
        console.log(
          `[PROXY] ${req.method} ${req.path} -> ${config.proxy.upstreamUrl}${req.path}`
        );
      }
    },
    // Preserve response headers
    onProxyRes: (proxyRes, req: Request) => {
      // Preserve all response headers
      // The proxy middleware handles this automatically, but we can add custom logic here if needed

      // Log proxy response (optional)
      if (config.server.nodeEnv === 'development') {
        console.log(
          `[PROXY] ${req.method} ${req.path} <- ${proxyRes.statusCode}`
        );
      }
    },
    // Error handling (includes timeout errors)
    onError: (err: Error, req: Request, res: Response) => {
      const isTimeout = err.message.includes('timeout') || err.message.includes('ETIMEDOUT');
      
      console.error(isTimeout ? '[PROXY TIMEOUT]' : '[PROXY ERROR]', {
        error: err.message,
        path: req.path,
        method: req.method,
        timeout: isTimeout ? config.proxy.timeout : undefined,
      });

      if (!res.headersSent) {
        if (isTimeout) {
          res.status(504).json({
            error: 'Gateway Timeout',
            message: 'Request to upstream server timed out',
            timeout: config.proxy.timeout,
          });
        } else {
          res.status(502).json({
            error: 'Bad Gateway',
            message: 'Failed to connect to upstream server',
            upstream: config.proxy.upstreamUrl,
          });
        }
      }
    },
  };

  return createProxyMiddleware(proxyOptions);
}

