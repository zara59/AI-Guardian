import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { checkDatabaseConnection, closeDatabase } from './config/db.js';
import { getClient, closeCache } from './cache/redisClient.js';
import { bootstrapDatabase } from '../scripts/bootstrap.js';
import { refreshOpportunities } from './services/refreshService.js';
import { logger } from './utils/logger.js';

export async function start() {
  const app = createApp();

  if (config.nodeEnv !== 'test') {
    try {
      await checkDatabaseConnection();
      logger.info('PostgreSQL connection verified');
      await bootstrapDatabase();
    } catch (err) {
      logger.warn('PostgreSQL not reachable at startup: ' + err.message);
    }
  }

  const server = app.listen(config.port, () => {
    logger.info(`AI Guardian backend listening on http://localhost:${config.port}`);
  });

  getClient().catch(() => {});

  // Phase 3: pull real provider data on boot (fail-soft; the API keeps
  // serving the last persisted PostgreSQL snapshot if providers are down).
  refreshOpportunities()
    .then((r) =>
      logger.info('Initial provider refresh complete', {
        refreshed: r.refreshed,
      }),
    )
    .catch((err) =>
      logger.warn('Initial provider refresh failed; serving persisted snapshot', {
        message: err.message,
      }),
    );

  const shutdown = async () => {
    logger.info('Shutting down...');
    server.close(async () => {
      try {
        await closeDatabase();
      } catch {
        /* noop */
      }
      try {
        await closeCache();
      } catch {
        /* noop */
      }
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

const isMain =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  start();
}