import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  logger,
  getToolLogger,
  logToolStart,
  logToolEnd,
  logToolError,
  metrics,
  withMetrics,
  rateLimiter,
  initRateLimiter,
  withRateLimit,
  DEFAULT_RATE_LIMIT_CONFIG,
} from '../src/observability/index.js';
import { ErrorCode } from '../src/shared/errors.js';

describe('logger', () => {
  it('creates base logger', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('creates child logger for tool', () => {
    const toolLogger = getToolLogger('test.tool');
    expect(toolLogger).toBeDefined();
    expect(typeof toolLogger.info).toBe('function');
  });

  it('logToolStart does not throw', () => {
    expect(() => logToolStart('test.tool', { param: 'value' })).not.toThrow();
  });

  it('logToolEnd does not throw', () => {
    expect(() => logToolEnd('test.tool', 100, true)).not.toThrow();
    expect(() => logToolEnd('test.tool', 50, false)).not.toThrow();
  });

  it('logToolError does not throw', () => {
    expect(() => logToolError('test.tool', new Error('test error'), 100)).not.toThrow();
    expect(() => logToolError('test.tool', 'string error')).not.toThrow();
  });
});

describe('metrics', () => {
  beforeEach(() => {
    metrics.reset();
  });

  it('records tool calls', () => {
    metrics.recordToolCall('tool.a', 100, true);
    metrics.recordToolCall('tool.a', 200, true);
    metrics.recordToolCall('tool.a', 50, false);

    const toolMetrics = metrics.getToolMetrics('tool.a');
    expect(toolMetrics).toBeDefined();
    expect(toolMetrics!.callCount).toBe(3);
    expect(toolMetrics!.errorCount).toBe(1);
    expect(toolMetrics!.totalDurationMs).toBe(350);
    expect(toolMetrics!.minDurationMs).toBe(50);
    expect(toolMetrics!.maxDurationMs).toBe(200);
  });

  it('records error counts by code', () => {
    metrics.recordError('TASK_NOT_FOUND');
    metrics.recordError('TASK_NOT_FOUND');
    metrics.recordError('CONFIG_INVALID');

    const taskError = metrics.getErrorMetrics('TASK_NOT_FOUND');
    expect(taskError).toBeDefined();
    expect(taskError!.count).toBe(2);

    const configError = metrics.getErrorMetrics('CONFIG_INVALID');
    expect(configError).toBeDefined();
    expect(configError!.count).toBe(1);
  });

  it('returns summary statistics', () => {
    metrics.recordToolCall('tool.a', 100, true);
    metrics.recordToolCall('tool.b', 200, false);

    const summary = metrics.getSummary();
    expect(summary.totalCalls).toBe(2);
    expect(summary.totalErrors).toBe(1);
    expect(summary.toolCount).toBe(2);
    expect(summary.avgDurationMs).toBe(150);
  });

  it('getAllToolMetrics returns all metrics', () => {
    metrics.recordToolCall('tool.a', 100, true);
    metrics.recordToolCall('tool.b', 200, true);

    const all = metrics.getAllToolMetrics();
    expect(all.size).toBe(2);
    expect(all.has('tool.a')).toBe(true);
    expect(all.has('tool.b')).toBe(true);
  });

  it('reset clears all metrics', () => {
    metrics.recordToolCall('tool.a', 100, true);
    metrics.recordError('ERROR');
    metrics.reset();

    expect(metrics.getAllToolMetrics().size).toBe(0);
    expect(metrics.getAllErrorMetrics().size).toBe(0);
  });

  it('logSummary does not throw', () => {
    metrics.recordToolCall('tool.a', 100, true);
    expect(() => metrics.logSummary()).not.toThrow();
  });
});

describe('withMetrics wrapper', () => {
  beforeEach(() => {
    metrics.reset();
  });

  it('wraps successful handler and records metrics', async () => {
    const handler = vi.fn().mockResolvedValue({ result: 'success' });
    const wrapped = withMetrics('test.handler', handler);

    const result = await wrapped({ input: 'test' });

    expect(result).toEqual({ result: 'success' });
    expect(handler).toHaveBeenCalledWith({ input: 'test' });

    const toolMetrics = metrics.getToolMetrics('test.handler');
    expect(toolMetrics!.callCount).toBe(1);
    expect(toolMetrics!.errorCount).toBe(0);
  });

  it('wraps failing handler and records error', async () => {
    const error = new Error('test error');
    (error as Error & { code: string }).code = 'TEST_ERROR';
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = withMetrics('test.handler', handler);

    await expect(wrapped({ input: 'test' })).rejects.toThrow('test error');

    const toolMetrics = metrics.getToolMetrics('test.handler');
    expect(toolMetrics!.callCount).toBe(1);
    expect(toolMetrics!.errorCount).toBe(1);

    const errorMetrics = metrics.getErrorMetrics('TEST_ERROR');
    expect(errorMetrics!.count).toBe(1);
  });
});

describe('rateLimiter', () => {
  beforeEach(() => {
    rateLimiter.resetAll();
    rateLimiter.setEnabled(false);
    rateLimiter.setConfig(DEFAULT_RATE_LIMIT_CONFIG);
  });

  it('is disabled by default', () => {
    expect(rateLimiter.isEnabled()).toBe(false);
  });

  it('allows all requests when disabled', () => {
    expect(rateLimiter.tryConsume('caller-1')).toBe(true);
    expect(rateLimiter.tryConsume('caller-1')).toBe(true);
  });

  it('can be enabled', () => {
    rateLimiter.setEnabled(true);
    expect(rateLimiter.isEnabled()).toBe(true);
  });

  it('limits requests when enabled', () => {
    rateLimiter.setConfig({ maxTokens: 3, refillRate: 10, refillIntervalMs: 60000 });
    rateLimiter.setEnabled(true);

    // First 3 should succeed
    expect(rateLimiter.tryConsume('caller-1')).toBe(true);
    expect(rateLimiter.tryConsume('caller-1')).toBe(true);
    expect(rateLimiter.tryConsume('caller-1')).toBe(true);

    // 4th should fail
    expect(() => rateLimiter.tryConsume('caller-1')).toThrow();

    try {
      rateLimiter.tryConsume('caller-1');
    } catch (error) {
      expect((error as { code: string }).code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
    }
  });

  it('tracks callers independently', () => {
    rateLimiter.setConfig({ maxTokens: 2, refillRate: 10, refillIntervalMs: 60000 });
    rateLimiter.setEnabled(true);

    expect(rateLimiter.tryConsume('caller-1')).toBe(true);
    expect(rateLimiter.tryConsume('caller-1')).toBe(true);
    expect(() => rateLimiter.tryConsume('caller-1')).toThrow();

    // Different caller should still have tokens
    expect(rateLimiter.tryConsume('caller-2')).toBe(true);
    expect(rateLimiter.tryConsume('caller-2')).toBe(true);
  });

  it('getRemainingTokens returns correct count', () => {
    rateLimiter.setConfig({ maxTokens: 5, refillRate: 10, refillIntervalMs: 60000 });
    rateLimiter.setEnabled(true);

    expect(rateLimiter.getRemainingTokens('new-caller')).toBe(5);

    rateLimiter.tryConsume('new-caller');
    rateLimiter.tryConsume('new-caller');

    expect(rateLimiter.getRemainingTokens('new-caller')).toBe(3);
  });

  it('resetCaller clears specific caller bucket', () => {
    rateLimiter.setConfig({ maxTokens: 2, refillRate: 10, refillIntervalMs: 60000 });
    rateLimiter.setEnabled(true);

    rateLimiter.tryConsume('caller-1');
    rateLimiter.tryConsume('caller-1');
    expect(() => rateLimiter.tryConsume('caller-1')).toThrow();

    rateLimiter.resetCaller('caller-1');
    expect(rateLimiter.tryConsume('caller-1')).toBe(true);
  });

  it('resetAll clears all buckets', () => {
    rateLimiter.setConfig({ maxTokens: 1, refillRate: 10, refillIntervalMs: 60000 });
    rateLimiter.setEnabled(true);

    rateLimiter.tryConsume('caller-1');
    rateLimiter.tryConsume('caller-2');

    rateLimiter.resetAll();

    expect(rateLimiter.tryConsume('caller-1')).toBe(true);
    expect(rateLimiter.tryConsume('caller-2')).toBe(true);
  });

  it('getStats returns bucket info', () => {
    rateLimiter.setEnabled(true);

    rateLimiter.tryConsume('caller-1');
    rateLimiter.tryConsume('caller-2');

    const stats = rateLimiter.getStats();
    expect(stats.activeBuckets).toBe(2);
    expect(stats.callerIds).toContain('caller-1');
    expect(stats.callerIds).toContain('caller-2');
  });

  it('getConfig returns current config', () => {
    rateLimiter.setConfig({ maxTokens: 50, refillRate: 200, refillIntervalMs: 30000 });

    const config = rateLimiter.getConfig();
    expect(config.maxTokens).toBe(50);
    expect(config.refillRate).toBe(200);
    expect(config.refillIntervalMs).toBe(30000);
  });
});

describe('initRateLimiter', () => {
  beforeEach(() => {
    rateLimiter.resetAll();
    rateLimiter.setEnabled(false);
    rateLimiter.setConfig(DEFAULT_RATE_LIMIT_CONFIG);
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_MAX_TOKENS;
    delete process.env.RATE_LIMIT_REFILL_RATE;
  });

  it('initializes with options', () => {
    initRateLimiter({ enabled: true, config: { maxTokens: 10 } });

    expect(rateLimiter.isEnabled()).toBe(true);
    expect(rateLimiter.getConfig().maxTokens).toBe(10);
  });

  it('initializes from environment variables', () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.RATE_LIMIT_MAX_TOKENS = '25';
    process.env.RATE_LIMIT_REFILL_RATE = '50';

    initRateLimiter();

    expect(rateLimiter.isEnabled()).toBe(true);
    expect(rateLimiter.getConfig().maxTokens).toBe(25);
    expect(rateLimiter.getConfig().refillRate).toBe(50);
  });
});

describe('withRateLimit wrapper', () => {
  beforeEach(() => {
    rateLimiter.resetAll();
    rateLimiter.setConfig({ maxTokens: 2, refillRate: 10, refillIntervalMs: 60000 });
  });

  it('passes through when rate limiter disabled', async () => {
    rateLimiter.setEnabled(false);
    const handler = vi.fn().mockResolvedValue('result');
    const wrapped = withRateLimit(handler);

    for (let i = 0; i < 10; i++) {
      await wrapped({ callerId: 'test' });
    }

    expect(handler).toHaveBeenCalledTimes(10);
  });

  it('enforces rate limit when enabled', async () => {
    rateLimiter.setEnabled(true);
    const handler = vi.fn().mockResolvedValue('result');
    const wrapped = withRateLimit(handler);

    await wrapped({ callerId: 'test' });
    await wrapped({ callerId: 'test' });

    await expect(wrapped({ callerId: 'test' })).rejects.toHaveProperty(
      'code',
      ErrorCode.RATE_LIMIT_EXCEEDED
    );
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('uses anonymous for missing callerId', async () => {
    rateLimiter.setEnabled(true);
    const handler = vi.fn().mockResolvedValue('result');
    const wrapped = withRateLimit(handler);

    await wrapped({});
    await wrapped({});

    const stats = rateLimiter.getStats();
    expect(stats.callerIds).toContain('anonymous');
  });
});
