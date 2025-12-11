/**
 * Logger module - provides structured logging using pino
 * Implements SDD section 14 observability requirements
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Create the base logger with appropriate transport
 * Uses pino-pretty in development for human-readable output
 */
function createLogger(): pino.Logger {
  if (isDev) {
    return pino({
      level: process.env.LOG_LEVEL ?? 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
  });
}

export const logger = createLogger();

/**
 * Create a child logger for a specific tool
 */
export function getToolLogger(toolName: string): pino.Logger {
  return logger.child({ tool: toolName });
}

/**
 * Log tool execution start
 */
export function logToolStart(
  toolName: string,
  params?: Record<string, unknown>
): void {
  const toolLogger = getToolLogger(toolName);
  toolLogger.info({ params, event: 'tool_start' }, `Starting ${toolName}`);
}

/**
 * Log tool execution end
 */
export function logToolEnd(
  toolName: string,
  durationMs: number,
  success: boolean
): void {
  const toolLogger = getToolLogger(toolName);
  toolLogger.info(
    { durationMs, success, event: 'tool_end' },
    `Completed ${toolName} in ${durationMs}ms`
  );
}

/**
 * Log tool execution error
 */
export function logToolError(
  toolName: string,
  error: Error | unknown,
  durationMs?: number
): void {
  const toolLogger = getToolLogger(toolName);
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode =
    error instanceof Error && 'code' in error ? (error as { code: string }).code : undefined;

  toolLogger.error(
    { error: errorMessage, errorCode, durationMs, event: 'tool_error' },
    `Error in ${toolName}: ${errorMessage}`
  );
}

export type { Logger } from 'pino';
