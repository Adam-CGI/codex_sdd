/**
 * Metrics module - provides in-memory counters and timers per tool
 * Implements SDD section 14 observability requirements
 */

import { logger } from './logger.js';

export interface ToolMetrics {
  callCount: number;
  errorCount: number;
  totalDurationMs: number;
  lastCallTimestamp?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
}

export interface ErrorMetrics {
  count: number;
  lastOccurrence?: number;
}

/**
 * In-memory metrics store
 */
class MetricsStore {
  private toolMetrics: Map<string, ToolMetrics> = new Map();
  private errorMetrics: Map<string, ErrorMetrics> = new Map();

  /**
   * Record a tool call
   */
  recordToolCall(toolName: string, durationMs: number, success: boolean): void {
    const existing = this.toolMetrics.get(toolName) ?? {
      callCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
    };

    existing.callCount++;
    existing.totalDurationMs += durationMs;
    existing.lastCallTimestamp = Date.now();

    if (existing.minDurationMs === undefined || durationMs < existing.minDurationMs) {
      existing.minDurationMs = durationMs;
    }
    if (existing.maxDurationMs === undefined || durationMs > existing.maxDurationMs) {
      existing.maxDurationMs = durationMs;
    }

    if (!success) {
      existing.errorCount++;
    }

    this.toolMetrics.set(toolName, existing);
  }

  /**
   * Record an error by error code
   */
  recordError(errorCode: string): void {
    const existing = this.errorMetrics.get(errorCode) ?? { count: 0 };
    existing.count++;
    existing.lastOccurrence = Date.now();
    this.errorMetrics.set(errorCode, existing);
  }

  /**
   * Get metrics for a specific tool
   */
  getToolMetrics(toolName: string): ToolMetrics | undefined {
    return this.toolMetrics.get(toolName);
  }

  /**
   * Get all tool metrics
   */
  getAllToolMetrics(): Map<string, ToolMetrics> {
    return new Map(this.toolMetrics);
  }

  /**
   * Get error metrics by code
   */
  getErrorMetrics(errorCode: string): ErrorMetrics | undefined {
    return this.errorMetrics.get(errorCode);
  }

  /**
   * Get all error metrics
   */
  getAllErrorMetrics(): Map<string, ErrorMetrics> {
    return new Map(this.errorMetrics);
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalCalls: number;
    totalErrors: number;
    toolCount: number;
    avgDurationMs: number;
  } {
    let totalCalls = 0;
    let totalErrors = 0;
    let totalDuration = 0;

    for (const metrics of this.toolMetrics.values()) {
      totalCalls += metrics.callCount;
      totalErrors += metrics.errorCount;
      totalDuration += metrics.totalDurationMs;
    }

    return {
      totalCalls,
      totalErrors,
      toolCount: this.toolMetrics.size,
      avgDurationMs: totalCalls > 0 ? totalDuration / totalCalls : 0,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.toolMetrics.clear();
    this.errorMetrics.clear();
  }

  /**
   * Log current metrics summary (for debug)
   */
  logSummary(): void {
    const summary = this.getSummary();
    logger.debug(
      {
        event: 'metrics_summary',
        ...summary,
      },
      'Metrics summary'
    );

    for (const [tool, metrics] of this.toolMetrics) {
      const avgDuration =
        metrics.callCount > 0 ? metrics.totalDurationMs / metrics.callCount : 0;
      logger.debug(
        {
          event: 'tool_metrics',
          tool,
          calls: metrics.callCount,
          errors: metrics.errorCount,
          avgDurationMs: avgDuration.toFixed(2),
          minDurationMs: metrics.minDurationMs,
          maxDurationMs: metrics.maxDurationMs,
        },
        `Tool metrics: ${tool}`
      );
    }
  }
}

// Singleton instance
export const metrics = new MetricsStore();

/**
 * Helper to wrap a tool handler with metrics collection
 */
export function withMetrics<TParams, TResult>(
  toolName: string,
  handler: (params: TParams) => Promise<TResult>
): (params: TParams) => Promise<TResult> {
  return async (params: TParams): Promise<TResult> => {
    const startTime = Date.now();
    let success = true;

    try {
      const result = await handler(params);
      return result;
    } catch (error) {
      success = false;
      if (error instanceof Error && 'code' in error) {
        metrics.recordError((error as { code: string }).code);
      }
      throw error;
    } finally {
      const durationMs = Date.now() - startTime;
      metrics.recordToolCall(toolName, durationMs, success);
    }
  };
}
