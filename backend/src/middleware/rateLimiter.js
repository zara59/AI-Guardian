import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

// Global API rate limiter. Redis-backed limiting is a later-phase upgrade;
// in-memory limiting works well for a single-instance dev backend.
export const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please slow down.',
    code: 'RATE_LIMITED',
  },
});