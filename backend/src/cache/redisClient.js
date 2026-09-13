import { createClient } from 'redis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let client = null;
let connected = false;
let connecting = null;

function create() {
  const c = createClient({ url: config.redisUrl });

  c.on('error', (err) => {
    connected = false;
    logger.warn('Redis client error (cache disabled until reconnect)', {
      message: err.message,
    });
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