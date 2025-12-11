import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  McpError,
  createErrorEnvelope,
  createSuccess,
  isError,
  isSuccess,
  wrapWithErrorHandling,
  Errors,
  type ErrorEnvelope,
  type SuccessResult,
} from '../src/shared/errors.js';

describe('ErrorCode enum', () => {
  it('should contain all configuration error codes', () => {
    expect(ErrorCode.CONFIG_NOT_FOUND).toBe('CONFIG_NOT_FOUND');
    expect(ErrorCode.CONFIG_INVALID).toBe('CONFIG_INVALID');
    expect(ErrorCode.STATUS_NOT_DEFINED).toBe('STATUS_NOT_DEFINED');
    expect(ErrorCode.IN_PROGRESS_STATUS_INVALID).toBe('IN_PROGRESS_STATUS_INVALID');
  });

  it('should contain all task-related error codes', () => {
    expect(ErrorCode.TASK_NOT_FOUND).toBe('TASK_NOT_FOUND');
    expect(ErrorCode.TASK_ID_MISMATCH).toBe('TASK_ID_MISMATCH');
    expect(ErrorCode.TASK_INVALID_STATUS).toBe('TASK_INVALID_STATUS');
    expect(ErrorCode.TASK_PARSE_ERROR).toBe('TASK_PARSE_ERROR');
    expect(ErrorCode.TASK_LOCKED).toBe('TASK_LOCKED');
    expect(ErrorCode.DEPENDENCIES_NOT_MET).toBe('DEPENDENCIES_NOT_MET');
  });

  it('should contain all gate & transition error codes', () => {
    expect(ErrorCode.GATE_VIOLATION).toBe('GATE_VIOLATION');
    expect(ErrorCode.INVALID_TRANSITION).toBe('INVALID_TRANSITION');
    expect(ErrorCode.CONFLICT_DETECTED).toBe('CONFLICT_DETECTED');
  });

  it('should contain all git error codes', () => {
    expect(ErrorCode.GIT_DIRTY).toBe('GIT_DIRTY');
    expect(ErrorCode.BRANCH_NOT_FOUND).toBe('BRANCH_NOT_FOUND');
    expect(ErrorCode.MERGE_CONFLICT).toBe('MERGE_CONFLICT');
  });

  it('should contain all spec/architecture error codes', () => {
    expect(ErrorCode.SPEC_NOT_FOUND).toBe('SPEC_NOT_FOUND');
    expect(ErrorCode.RULE_PARSE_ERROR).toBe('RULE_PARSE_ERROR');
    expect(ErrorCode.ARCH_VIOLATION).toBe('ARCH_VIOLATION');
  });

  it('should contain all general error codes', () => {
    expect(ErrorCode.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
  });
});

describe('createErrorEnvelope', () => {
  it('should create proper error envelope structure', () => {
    const envelope = createErrorEnvelope(ErrorCode.TASK_NOT_FOUND, 'Task not found');

    expect(envelope).toEqual({
      error: {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found',
      },
    });
  });

  it('should include details when provided', () => {
    const envelope = createErrorEnvelope(ErrorCode.TASK_NOT_FOUND, 'Task not found', {
      taskId: 'task-001',
    });

    expect(envelope.error.details).toEqual({ taskId: 'task-001' });
  });

  it('should omit details when empty', () => {
    const envelope = createErrorEnvelope(ErrorCode.TASK_NOT_FOUND, 'Task not found', {});

    expect(envelope.error.details).toBeUndefined();
  });
});

describe('createSuccess', () => {
  it('should create proper success result', () => {
    const result = createSuccess({ id: 'task-001', title: 'Test Task' });

    expect(result).toEqual({
      success: true,
      data: { id: 'task-001', title: 'Test Task' },
    });
  });
});

describe('isError / isSuccess type guards', () => {
  it('should correctly identify error envelopes', () => {
    const error: ErrorEnvelope = createErrorEnvelope(ErrorCode.TASK_NOT_FOUND, 'Not found');
    const success: SuccessResult<string> = createSuccess('data');

    expect(isError(error)).toBe(true);
    expect(isError(success)).toBe(false);
  });

  it('should correctly identify success results', () => {
    const error: ErrorEnvelope = createErrorEnvelope(ErrorCode.TASK_NOT_FOUND, 'Not found');
    const success: SuccessResult<string> = createSuccess('data');

    expect(isSuccess(error)).toBe(false);
    expect(isSuccess(success)).toBe(true);
  });
});

describe('McpError', () => {
  it('should create error with code and message', () => {
    const error = new McpError(ErrorCode.TASK_NOT_FOUND, 'Task not found');

    expect(error.code).toBe(ErrorCode.TASK_NOT_FOUND);
    expect(error.message).toBe('Task not found');
    expect(error.name).toBe('McpError');
    expect(error.details).toBeUndefined();
  });

  it('should create error with details', () => {
    const error = new McpError(ErrorCode.TASK_NOT_FOUND, 'Task not found', {
      taskId: 'task-001',
    });

    expect(error.details).toEqual({ taskId: 'task-001' });
  });

  it('should convert to envelope', () => {
    const error = new McpError(ErrorCode.TASK_NOT_FOUND, 'Task not found', {
      taskId: 'task-001',
    });

    const envelope = error.toEnvelope();

    expect(envelope).toEqual({
      error: {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found',
        details: { taskId: 'task-001' },
      },
    });
  });

  it('should be an instance of Error', () => {
    const error = new McpError(ErrorCode.TASK_NOT_FOUND, 'Task not found');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof McpError).toBe(true);
  });
});

describe('wrapWithErrorHandling', () => {
  it('should wrap successful async functions', async () => {
    const result = await wrapWithErrorHandling(async () => {
      return { id: 'task-001' };
    });

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.data).toEqual({ id: 'task-001' });
    }
  });

  it('should catch McpError and convert to envelope', async () => {
    const result = await wrapWithErrorHandling(async () => {
      throw new McpError(ErrorCode.TASK_NOT_FOUND, 'Not found', { taskId: 'task-001' });
    });

    expect(isError(result)).toBe(true);
    if (isError(result)) {
      expect(result.error.code).toBe(ErrorCode.TASK_NOT_FOUND);
      expect(result.error.message).toBe('Not found');
      expect(result.error.details).toEqual({ taskId: 'task-001' });
    }
  });

  it('should catch regular errors and wrap them', async () => {
    const result = await wrapWithErrorHandling(async () => {
      throw new Error('Something went wrong');
    });

    expect(isError(result)).toBe(true);
    if (isError(result)) {
      expect(result.error.message).toBe('Something went wrong');
    }
  });
});

describe('Errors helper functions', () => {
  it('should create taskNotFound error', () => {
    const error = Errors.taskNotFound('task-001');

    expect(error.code).toBe(ErrorCode.TASK_NOT_FOUND);
    expect(error.message).toContain('task-001');
    expect(error.details?.taskId).toBe('task-001');
  });

  it('should create taskIdMismatch error', () => {
    const error = Errors.taskIdMismatch('task-001', 'task-002');

    expect(error.code).toBe(ErrorCode.TASK_ID_MISMATCH);
    expect(error.details?.filenameId).toBe('task-001');
    expect(error.details?.metaId).toBe('task-002');
  });

  it('should create conflictDetected error', () => {
    const error = Errors.conflictDetected('task-001', 1, 2);

    expect(error.code).toBe(ErrorCode.CONFLICT_DETECTED);
    expect(error.details?.expectedVersion).toBe(1);
    expect(error.details?.actualVersion).toBe(2);
  });

  it('should create gateViolation error', () => {
    const error = Errors.gateViolation('task-001', 'Backlog');

    expect(error.code).toBe(ErrorCode.GATE_VIOLATION);
    expect(error.details?.currentStatus).toBe('Backlog');
  });

  it('should create invalidTransition error', () => {
    const error = Errors.invalidTransition('task-001', 'Backlog', 'Done');

    expect(error.code).toBe(ErrorCode.INVALID_TRANSITION);
    expect(error.details?.from).toBe('Backlog');
    expect(error.details?.to).toBe('Done');
  });

  it('should create dependenciesNotMet error', () => {
    const error = Errors.dependenciesNotMet('task-005', ['task-001', 'task-002']);

    expect(error.code).toBe(ErrorCode.DEPENDENCIES_NOT_MET);
    expect(error.details?.unmetDeps).toEqual(['task-001', 'task-002']);
  });

  it('should create unauthorized error', () => {
    const error = Errors.unauthorized('agent:bot', 'planning.update_spec');

    expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(error.details?.callerId).toBe('agent:bot');
    expect(error.details?.operation).toBe('planning.update_spec');
  });

  it('should create rateLimitExceeded error', () => {
    const error = Errors.rateLimitExceeded('agent:bot', 100);

    expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
    expect(error.details?.callerId).toBe('agent:bot');
    expect(error.details?.limit).toBe(100);
  });
});
