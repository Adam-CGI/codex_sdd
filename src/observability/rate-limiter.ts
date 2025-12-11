/**
 * Rate limiter module - implements token bucket algorithm
 * Implements SDD section 12 security requirements for per-caller rate limiting
 */

import { Errors } from '../shared/errors.js';
import { logger } from './logger.js';

export interface RateLimiterConfig {
  /** Maximum tokens in bucket (burst capacity) */
  maxTokens: number;
  /** Tokens added per interval */
  refillRate: number;
  /** Refill interval in milliseconds */
  refillIntervalMs: number;
}

export interface CallerBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Default rate limiter config: 100 ops/min with burst of 20
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimiterConfig = {
  maxTokens: 20,
  refillRate: 100,
  refillIntervalMs: 60000, // 1 minute
};

/**
 * Token bucket rate limiter
 */
class RateLimiter {
  private buckets: Map<string, CallerBucket> = new Map();
  private config: RateLimiterConfig;
  private enabled: boolean;

  constructor(config: RateLimiterConfig = DEFAULT_RATE_LIMIT_CONFIG, enabled = false) {
    this.config = config;
    this.enabled = enabled;
  }

  /**
   * Enable or disable the rate limiter
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info({ enabled, event: 'rate_limiter_toggle' }, `Rate limiter ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if rate limiter is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ config: this.config, event: 'rate_limiter_config' }, 'Rate limiter config updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }

  /**
   * Try to consume a token for a caller
   * Returns true if allowed, throws RATE_LIMIT_EXCEEDED if not
   */
  tryConsume(callerId: string): boolean {
    if (!this.enabled) {
      return true;
    }

    const bucket = this.getOrCreateBucket(callerId);
    this.refillBucket(bucket);

    if (bucket.tokens < 1) {
      logger.warn(
        { callerId, tokens: bucket.tokens, event: 'rate_limit_exceeded' },
        `Rate limit exceeded for ${callerId}`
      );
      throw Errors.rateLimitExceeded(callerId, this.config.refillRate);
    }

    bucket.tokens -= 1;
    this.buckets.set(callerId, bucket);

    return true;
  }

  /**
   * Check remaining tokens for a caller (without consuming)
   */
  getRemainingTokens(callerId: string): number {
    if (!this.enabled) {
      return Infinity;
    }

    const bucket = this.buckets.get(callerId);
    if (!bucket) {
      return this.config.maxTokens;
    }

    // Simulate refill to get accurate count
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(
      (timePassed / this.config.refillIntervalMs) * this.config.refillRate
    );
    const simulatedTokens = Math.min(bucket.tokens + tokensToAdd, this.config.maxTokens);

    return simulatedTokens;
  }

  /**
   * Reset a caller's bucket (e.g., after successful auth)
   */
  resetCaller(callerId: string): void {
    this.buckets.delete(callerId);
    logger.debug({ callerId, event: 'rate_limit_reset' }, `Rate limit reset for ${callerId}`);
  }

  /**
   * Reset all buckets
   */
  resetAll(): void {
    this.buckets.clear();
    logger.debug({ event: 'rate_limit_reset_all' }, 'All rate limit buckets reset');
  }

  /**
   * Get stats about current buckets
   */
  getStats(): {
    activeBuckets: number;
    callerIds: string[];
  } {
    return {
      activeBuckets: this.buckets.size,
      callerIds: Array.from(this.buckets.keys()),
    };
  }

  private getOrCreateBucket(callerId: string): CallerBucket {
    const existing = this.buckets.get(callerId);
    if (existing) {
      return existing;
    }

    const newBucket: CallerBucket = {
      tokens: this.config.maxTokens,
      lastRefill: Date.now(),
    };
    this.buckets.set(callerId, newBucket);
    return newBucket;
  }

  private refillBucket(bucket: CallerBucket): void {
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;

    if (timePassed >= this.config.refillIntervalMs) {
      // Full refill cycles
      const cycles = Math.floor(timePassed / this.config.refillIntervalMs);
      const tokensToAdd = cycles * this.config.refillRate;
      bucket.tokens = Math.min(bucket.tokens + tokensToAdd, this.config.maxTokens);
      bucket.lastRefill = now - (timePassed % this.config.refillIntervalMs);
    }
  }
}

// Singleton instance - disabled by default per spec
export const rateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT_CONFIG, false);

/**
 * Initialize rate limiter from environment or config
 */
export function initRateLimiter(options?: {
  enabled?: boolean;
  config?: Partial<RateLimiterConfig>;
}): void {
  // Check environment variables
  const envEnabled = process.env.RATE_LIMIT_ENABLED === 'true';
  const envMaxTokens = process.env.RATE_LIMIT_MAX_TOKENS
    ? parseInt(process.env.RATE_LIMIT_MAX_TOKENS, 10)
    : undefined;
  const envRefillRate = process.env.RATE_LIMIT_REFILL_RATE
    ? parseInt(process.env.RATE_LIMIT_REFILL_RATE, 10)
    : undefined;

  const config: Partial<RateLimiterConfig> = {
    ...options?.config,
  };

  if (envMaxTokens !== undefined && !isNaN(envMaxTokens)) {
    config.maxTokens = envMaxTokens;
  }
  if (envRefillRate !== undefined && !isNaN(envRefillRate)) {
    config.refillRate = envRefillRate;
  }

  if (Object.keys(config).length > 0) {
    rateLimiter.setConfig(config);
  }

  rateLimiter.setEnabled(options?.enabled ?? envEnabled);
}

/**
 * Middleware-style wrapper to apply rate limiting to a handler
 */
export function withRateLimit<TParams extends { callerId?: string }, TResult>(
  handler: (params: TParams) => Promise<TResult>
): (params: TParams) => Promise<TResult> {
  return async (params: TParams): Promise<TResult> => {
    const callerId = params.callerId ?? 'anonymous';
    rateLimiter.tryConsume(callerId);
    return handler(params);
  };
}
