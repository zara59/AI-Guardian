import { checkDatabaseConnection } from '../config/db.js';
import { isCacheAvailable } from '../cache/redisClient.js';
import { ok } from '../utils/response.js';
import asyncHandler from '../utils/asyncHandler.js';

// /api/health - lightweight liveness + dependency status for the frontend
// and for the Phase 2 completion test. Always returns 200 unless the app is
// truly down; dependency health is reported inside the body.
export const health = asyncHandler(async (_req, res) => {
  let database = 'available';
  let cache = 'available';
  try {
    await checkDatabaseConnection();
  } catch {
    database = 'unavailable';
  }
  if (!(await isCacheAvailable())) {
    cache = 'unavailable';
  }

  return ok(res, {
    status: 'ok',
    service: 'ai-guardian-backend',
    version: process.env.npm_package_version || '0.1.0',
    timestamp: new Date().toISOString(),
    infrastructure: { database, cache },
  });
});