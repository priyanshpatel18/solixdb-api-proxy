# SolixDB API Proxy

Low-latency reverse proxy server that forwards requests from `api.solixdb.xyz` to the SolixDB API backend.

## Features

- **Minimal Overhead**: Pure pass-through proxy with no request/response buffering
- **HTTP Keep-Alive**: Reuses connections to upstream for optimal latency
- **Request Streaming**: Streams large payloads without buffering
- **Header Preservation**: Forwards all original headers including API keys and adds standard proxy headers
- **Error Handling**: Graceful error handling with proper HTTP status codes
- **Health Checks**: Built-in health check endpoint for monitoring

## Quick Start

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Configuration

Environment variables (see `.env.example`):

- `PORT` - Proxy server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `UPSTREAM_URL` - Target API URL (default: http://localhost:3000)
- `TIMEOUT` - Request timeout in milliseconds (default: 30000)
- `KEEP_ALIVE` - Enable HTTP keep-alive connections (default: true)

### Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Architecture

The proxy is a minimal Express.js server using `http-proxy-middleware` for efficient request forwarding:

- **No Body Parsing**: Requests are passed through without parsing to minimize overhead
- **Connection Pooling**: HTTP keep-alive with connection reuse (max 50 sockets)
- **Streaming**: Large responses are streamed directly to clients
- **Header Forwarding**: All original headers are preserved, including `x-api-key` for authentication, with standard `X-Forwarded-*` headers added

## Endpoints

### Health Check

```bash
GET /health
```

Returns proxy status and configuration:

```json
{
  "status": "ok",
  "service": "api-proxy",
  "upstream": "http://localhost:3000",
  "timestamp": "2025-01-20T10:00:00.000Z",
  "version": "1.0.0"
}
```

### All Other Endpoints

All other requests are proxied to the upstream API server:

- `GET /` → `http://localhost:3000/`
- `POST /api/v1/rpc` → `http://localhost:3000/api/v1/rpc`
- `POST /api/v1/query` → `http://localhost:3000/api/v1/query`
- `GET /health` → `http://localhost:3000/health` (upstream health check)
- `GET /metrics` → `http://localhost:3000/metrics`
- etc.

**Note**: The proxy forwards all headers including `x-api-key` for API key authentication. API keys can also be passed via query parameter `?api-key=YOUR_KEY`.

## API Key Authentication

The proxy automatically forwards API key headers to the upstream API:

- **Header**: `x-api-key: YOUR_API_KEY` - Forwarded as-is
- **Query Parameter**: `?api-key=YOUR_API_KEY` - Forwarded in the request

The upstream API will validate these API keys and apply plan-based rate limiting.

## Deployment

### Recommended Setup

1. **Run on same infrastructure** as main API for lowest latency
2. **Configure DNS**: Point `api.solixdb.xyz` to proxy server
3. **SSL Termination**: Use reverse proxy (nginx/traefik) in front for SSL termination
4. **Process Manager**: Use PM2 or systemd for process management

### PM2 Example

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name api-proxy

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name api.solixdb.xyz;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker Example

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

```bash
docker build -t solixdb-api-proxy .
docker run -d -p 3001:3001 --env-file .env solixdb-api-proxy
```

## Monitoring

### Health Check

Monitor the proxy health endpoint:

```bash
curl http://localhost:3001/health
```

### Logs

The proxy logs:
- Proxy requests/responses (development mode only)
- Errors and timeouts
- Server startup/shutdown

For production, consider integrating with a logging service or using structured logging.

## Performance

- **Latency**: <5ms overhead for pass-through requests
- **Throughput**: Handles 1000+ concurrent requests
- **Connection Reuse**: HTTP keep-alive reduces connection overhead
- **Memory**: Minimal memory footprint (~50MB)

## Troubleshooting

### Upstream Connection Errors

If you see 502 errors:
- Verify `UPSTREAM_URL` is correct and accessible
- Check upstream server health
- Verify network connectivity

### Timeout Errors

If you see 504 errors:
- Increase `TIMEOUT` value for slow endpoints
- Check upstream server performance
- Consider increasing timeout for specific endpoints

### High Latency

- Ensure `KEEP_ALIVE=true` for connection reuse
- Run proxy on same infrastructure as upstream
- Check network latency between proxy and upstream

### API Key Authentication Issues

If you see 401 errors:
- Verify API key is being forwarded (check logs in development mode)
- Ensure `x-api-key` header is being sent from client
- Check that upstream API is properly configured with Supabase

## License

MIT
