/**
 * Observability module - exports logging, metrics, and rate limiting
 */

export {
  logger,
  getToolLogger,
  logToolStart,
  logToolEnd,
  logToolError,
} from './logger.js';

export type { Logger } from './logger.js';

export {
  metrics,
  withMetrics,
} from './metrics.js';

export type { ToolMetrics, ErrorMetrics } from './metrics.js';

export {
  rateLimiter,
  initRateLimiter,
  withRateLimit,
  DEFAULT_RATE_LIMIT_CONFIG,
} from './rate-limiter.js';

export type { RateLimiterConfig, CallerBucket } from './rate-limiter.js';
