import 'dotenv/config';

const env = process.env;

export const config = Object.freeze({
  nodeEnv: env.NODE_ENV || 'development',
  isProduction: (env.NODE_ENV || 'development') === 'production',
  port: parseInt(env.PORT || '3000', 10),
  databaseUrl: env.DATABASE_URL || 'postgres://localhost:5432/ai_guardian',
  redisUrl: env.REDIS_URL || 'redis://127.0.0.1:6379',
  corsOrigin: (env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  rateLimit: {
    windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(env.RATE_LIMIT_MAX || '100', 10),
  },
  cacheTtl: {
    opportunity: parseInt(env.OPPORTUNITY_CACHE_TTL || '120', 10),
    ranking: parseInt(env.RANKING_CACHE_TTL || '300', 10),
    market: parseInt(env.MARKET_CACHE_TTL || '60', 10),
    yields: parseInt(env.YIELDS_CACHE_TTL || '300', 10),
    onchain: parseInt(env.ONCHAIN_CACHE_TTL || '3600', 10),
  },
});