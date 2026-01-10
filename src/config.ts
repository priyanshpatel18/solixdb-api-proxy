import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  proxy: {
    upstreamUrl: process.env.UPSTREAM_URL || 'http://localhost:3000', // Default to local API server
    timeout: parseInt(process.env.TIMEOUT || '30000', 10),
    keepAlive: process.env.KEEP_ALIVE !== 'false',
  },
};

