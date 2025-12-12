/**
 * Error handling module - implements error envelope and error codes per SDD section 10
 */

/**
 * Error codes as defined in SDD section 10.2
 */
export enum ErrorCode {
  // Configuration errors
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  CONFIG_INVALID = 'CONFIG_INVALID',
  STATUS_NOT_DEFINED = 'STATUS_NOT_DEFINED',
  IN_PROGRESS_STATUS_INVALID = 'IN_PROGRESS_STATUS_INVALID',

  // Task-related errors
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  TASK_ID_MISMATCH = 'TASK_ID_MISMATCH',
  TASK_INVALID_STATUS = 'TASK_INVALID_STATUS',
  TASK_PARSE_ERROR = 'TASK_PARSE_ERROR',
  TASK_LOCKED = 'TASK_LOCKED',
  DEPENDENCIES_NOT_MET = 'DEPENDENCIES_NOT_MET',

  // Gate & transition errors
  GATE_VIOLATION = 'GATE_VIOLATION',
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  CONFLICT_DETECTED = 'CONFLICT_DETECTED',

  // Git errors
  GIT_DIRTY = 'GIT_DIRTY',
  BRANCH_NOT_FOUND = 'BRANCH_NOT_FOUND',
  MERGE_CONFLICT = 'MERGE_CONFLICT',

  // Spec/architecture errors
  SPEC_NOT_FOUND = 'SPEC_NOT_FOUND',
  RULE_PARSE_ERROR = 'RULE_PARSE_ERROR',
  ARCH_VIOLATION = 'ARCH_VIOLATION',

  // General errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED = 'UNAUTHORIZED',
}

/**
 * Error details - additional context for the error
 */
export type ErrorDetails = Record<string, unknown>;

/**
 * Error envelope structure per SDD section 10.1
 */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
  };
}

/**
 * Success result wrapper
 */
export interface SuccessResult<T> {
  success: true;
  data: T;
}

/**
 * Result type - either success with data or error envelope
 */
export type Result<T> = SuccessResult<T> | ErrorEnvelope;

/**
 * Type guard to check if result is an error
 */
export function isError<T>(result: Result<T>): result is ErrorEnvelope {
  return 'error' in result;
}

/**
 * Type guard to check if result is success
 */
export function isSuccess<T>(result: Result<T>): result is SuccessResult<T> {
  return 'success' in result && result.success === true;
}

/**
 * Custom error class that carries error code and details
 */
export class McpError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: ErrorDetails;

  constructor(code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.details = details;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, McpError);
    }
  }

  /**
   * Convert to error envelope format
   */
  toEnvelope(): ErrorEnvelope {
    return createErrorEnvelope(this.code, this.message, this.details);
  }
}

/**
 * Create an error envelope
 */
export function createErrorEnvelope(
  code: ErrorCode,
  message: string,
  details?: ErrorDetails
): ErrorEnvelope {
  const envelope: ErrorEnvelope = {
    error: {
      code,
      message,
    },
  };

  if (details && Object.keys(details).length > 0) {
    envelope.error.details = details;
  }

  return envelope;
}

/**
 * Create a success result
 */
export function createSuccess<T>(data: T): SuccessResult<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Wrap a function to catch errors and convert to error envelope
 */
export async function wrapWithErrorHandling<T>(
  fn: () => Promise<T>
): Promise<Result<T>> {
  try {
    const data = await fn();
    return createSuccess(data);
  } catch (error) {
    if (error instanceof McpError) {
      return error.toEnvelope();
    }

    // Unknown errors get wrapped as generic errors
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return createErrorEnvelope(ErrorCode.CONFIG_INVALID, message, {
      originalError: String(error),
    });
  }
}

/**
 * Helper to throw common errors
 */
export const Errors = {
  configNotFound: (path?: string) =>
    new McpError(ErrorCode.CONFIG_NOT_FOUND, 'Configuration file not found', { path }),

  configInvalid: (reason: string) =>
    new McpError(ErrorCode.CONFIG_INVALID, `Invalid configuration: ${reason}`),

  statusNotDefined: (status: string) =>
    new McpError(ErrorCode.STATUS_NOT_DEFINED, `Status "${status}" is not defined in config`, {
      status,
    }),

  inProgressStatusInvalid: (status: string) =>
    new McpError(
      ErrorCode.IN_PROGRESS_STATUS_INVALID,
      `Status "${status}" in in_progress_statuses is not defined in statuses`,
      { status }
    ),

  taskNotFound: (taskId: string) =>
    new McpError(ErrorCode.TASK_NOT_FOUND, `Task "${taskId}" not found`, { taskId }),

  taskIdMismatch: (filenameId: string, metaId: string) =>
    new McpError(
      ErrorCode.TASK_ID_MISMATCH,
      `Task ID mismatch: filename says "${filenameId}" but metadata says "${metaId}"`,
      { filenameId, metaId }
    ),

  taskInvalidStatus: (taskId: string, status: string) =>
    new McpError(ErrorCode.TASK_INVALID_STATUS, `Invalid status "${status}" for task "${taskId}"`, {
      taskId,
      status,
    }),

  taskParseError: (taskId: string, reason: string) =>
    new McpError(ErrorCode.TASK_PARSE_ERROR, `Failed to parse task "${taskId}": ${reason}`, {
      taskId,
    }),

  taskLocked: (taskId: string) =>
    new McpError(ErrorCode.TASK_LOCKED, `Task "${taskId}" is locked by another process`, {
      taskId,
    }),

  dependenciesNotMet: (taskId: string, unmetDeps: string[]) =>
    new McpError(
      ErrorCode.DEPENDENCIES_NOT_MET,
      `Task "${taskId}" has unmet dependencies: ${unmetDeps.join(', ')}`,
      { taskId, unmetDeps }
    ),

  gateViolation: (taskId: string, currentStatus: string) =>
    new McpError(
      ErrorCode.GATE_VIOLATION,
      `Task "${taskId}" is in status "${currentStatus}", not in an in-progress status`,
      { taskId, currentStatus }
    ),

  invalidTransition: (taskId: string, from: string, to: string) =>
    new McpError(
      ErrorCode.INVALID_TRANSITION,
      `Transition from "${from}" to "${to}" is not allowed for task "${taskId}"`,
      { taskId, from, to }
    ),

  conflictDetected: (taskId: string, expectedVersion: number, actualVersion: number) =>
    new McpError(
      ErrorCode.CONFLICT_DETECTED,
      `Version conflict for task "${taskId}": expected ${expectedVersion}, found ${actualVersion}`,
      { taskId, expectedVersion, actualVersion }
    ),

  gitDirty: (staged: string[], unstaged: string[], untracked: string[]) =>
    new McpError(ErrorCode.GIT_DIRTY, 'Working directory has uncommitted changes', {
      staged,
      unstaged,
      untracked,
    }),

  branchNotFound: (branch: string) =>
    new McpError(ErrorCode.BRANCH_NOT_FOUND, `Branch "${branch}" not found`, { branch }),

  mergeConflict: (files: string[]) =>
    new McpError(ErrorCode.MERGE_CONFLICT, 'Merge conflict detected', { conflictingFiles: files }),

  specNotFound: (specPath: string) =>
    new McpError(ErrorCode.SPEC_NOT_FOUND, `Spec "${specPath}" not found`, { specPath }),

  ruleParseError: (reason: string) =>
    new McpError(ErrorCode.RULE_PARSE_ERROR, `Failed to parse architecture rules: ${reason}`),

  archViolation: (violations: Array<{ rule: string; description: string }>) =>
    new McpError(ErrorCode.ARCH_VIOLATION, 'Architecture violations detected', { violations }),

  rateLimitExceeded: (callerId: string, limit: number) =>
    new McpError(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded for caller "${callerId}"`,
      { callerId, limit }
    ),

  unauthorized: (callerId: string, operation: string) =>
    new McpError(
      ErrorCode.UNAUTHORIZED,
      `Caller "${callerId}" is not authorized to perform "${operation}"`,
      { callerId, operation }
    ),

  /**
   * Enhanced parameter validation errors with context
   */
  parameterMissing: (paramName: string, expectedType: string, examples?: string[]) =>
    new McpError(
      ErrorCode.CONFIG_INVALID,
      `Missing required parameter "${paramName}". Expected: ${expectedType}`,
      {
        parameter: paramName,
        expectedType,
        examples: examples ?? [],
        hint: `Provide ${paramName} as a ${expectedType}`,
      }
    ),

  parameterInvalid: (
    paramName: string,
    receivedValue: unknown,
    expectedFormat: string,
    examples?: string[]
  ) =>
    new McpError(
      ErrorCode.CONFIG_INVALID,
      `Invalid value for parameter "${paramName}": expected ${expectedFormat}`,
      {
        parameter: paramName,
        received: typeof receivedValue,
        receivedValue: receivedValue === undefined ? 'undefined' : String(receivedValue).slice(0, 100),
        expectedFormat,
        examples: examples ?? [],
      }
    ),

  parameterTypeMismatch: (paramName: string, expected: string, received: string) =>
    new McpError(
      ErrorCode.CONFIG_INVALID,
      `Parameter "${paramName}" has wrong type: expected ${expected}, received ${received}`,
      {
        parameter: paramName,
        expectedType: expected,
        receivedType: received,
      }
    ),
};
