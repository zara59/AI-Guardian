import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import healthRoutes from './routes/healthRoutes.js';
import opportunityRoutes from './routes/opportunityRoutes.js';
import rankingRoutes from './routes/rankingRoutes.js';
import preferenceRoutes from './routes/preferenceRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import guardianRoutes from './routes/guardianRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import workflowRoutes from '../../keeper hub integration/backend/routes.js';
import phase6Routes from '../../full end to end execution and testing/backend/routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '256kb' }));
  app.use(globalLimiter);

  if (config.nodeEnv !== 'test') {
    app.use((req, res, next) => {
      res.on('finish', () => {
        logger.info(`${req.method} ${req.originalUrl} ${res.statusCode}`);
      });
      next();
    });
  }

  app.use('/api/health', healthRoutes);
  app.use('/api/opportunities', opportunityRoutes);
  app.use('/api/rankings', rankingRoutes);
  app.use('/api/preferences', preferenceRoutes);
  app.use('/api/activities', activityRoutes);
  app.use('/api/guardian', guardianRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/workflows', workflowRoutes);
  app.use('/api/phase6', phase6Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}