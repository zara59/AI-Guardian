import { createClient } from 'redis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let client = null;
let connected = false;
let connecting = null;
let warned = false;

function available() {
  return Boolean(config.redisUrl);
}

function create() {
  const c = createClient({
    url: config.redisUrl,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 500, 30000),
    },
  });

  c.on('error', () => {
    connected = false;
  });
  c.on('connect', () => {
    connected = true;
  });
  c.on('end', () => {
    connected = false;
  });
  return c;
}

export async function getClient() {
  if (!available()) {
    if (!warned) {
      warned = true;
      logger.warn('Redis not configured (REDIS_URL unset), running without cache');
    }
    return null;
  }
  if (client && connected) return client;
  if (connecting) return null;

  client = client || create();
  connecting = client
    .connect()
    .then(() => {
      connected = true;
      return client;
    })
    .catch((err) => {
      logger.warn('Redis connection failed, continuing without cache', {
        message: err.message,
      });
      connected = false;
      return null;
    })
    .finally(() => {
      connecting = null;
    });

  return null;
}

export async function isCacheAvailable() {
  if (!available()) return false;
  try {
    await getClient();
    return connected;
  } catch {
    return false;
  }
}

export async function closeCache() {
  if (client) {
    try {
      await client.quit();
    } catch {
      /* noop */
    }
    client = null;
    connected = false;
  }
}