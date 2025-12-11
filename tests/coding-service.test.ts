import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  startTask,
  suggestNextStep,
  updateTaskStatus,
} from '../src/coding/coding-service.js';
import { ErrorCode } from '../src/shared/errors.js';

describe('Coding Service', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coding-test-'));

    // Create directory structure
    await fs.mkdir(path.join(tmpDir, 'backlog'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'architecture'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'reviews'), { recursive: true });

    // Create config
    const config = `schema_version: "3.0"
statuses:
  - Backlog
  - Ready
  - In Progress
  - In Review
  - Done
in_progress_statuses:
  - In Progress
transitions:
  Backlog: [Ready]
  Ready: [In Progress]
  In Progress: [In Review]
  In Review: [Done, In Progress]
  Done: []
roles:
  maintainers:
    - user:alice
`;
    await fs.writeFile(path.join(tmpDir, 'backlog', 'config.yaml'), config, 'utf8');

    // Create architecture rules
    const rules = `layers:
  - name: domain
    path: src/domain
rules:
  - "domain may not depend on ui"
`;
    await fs.writeFile(path.join(tmpDir, 'architecture', 'rules.yaml'), rules, 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('startTask', () => {
    it('should return task details with spec and architecture context', async () => {
      // Create spec
      const spec = `---
id: feature-login
schema_version: "3.0"
---
# User Login Feature

## Overview
Implement secure user login functionality.

## Requirements
- Email/password authentication
- Token-based sessions
`;
      await fs.writeFile(path.join(tmpDir, 'specs', 'feature-login.md'), spec, 'utf8');

      // Create task in "In Progress" status
      const task = `---
id: task-001
version: 1
status: In Progress
spec: feature-login
priority: high
created: 2025-12-11T10:00:00Z
updated: 2025-12-11T10:00:00Z
schema_version: "3.0"
---
# Implement login API endpoint

## Description
Create REST API endpoint for user login.

## Acceptance Criteria
- [ ] POST /api/login accepts email and password
- [ ] Returns JWT token on success
- [ ] Returns 401 on invalid credentials

## Implementation Notes
- Use \`src/auth/login.ts\` for business logic
- Follow existing pattern in \`src/auth/register.ts\`
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-001 - Implement login API endpoint.md'),
        task,
        'utf8',
      );

      const result = await startTask('task-001', { baseDir: tmpDir });

      expect(result.task.meta.id).toBe('task-001');
      expect(result.task.meta.status).toBe('In Progress');
      expect(result.spec.id).toBe('feature-login');
      expect(result.spec.summary).toContain('User Login Feature');
      expect(result.architecture.rules_path).toContain('architecture/rules.yaml');
      expect(result.architecture.notes.length).toBeGreaterThan(0);
      expect(result.git.current_branch).toBeDefined();
      expect(result.reviews).toEqual([]);
      expect(result.relevant_files).toContain('src/auth/login.ts');
      expect(result.relevant_files).toContain('src/auth/register.ts');
    });

    it('should throw GATE_VIOLATION if task is not in in_progress_statuses', async () => {
      // Create task in "Backlog" status
      const task = `---
id: task-002
version: 1
status: Backlog
spec: feature-login
schema_version: "3.0"
---
# Some task
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-002 - Some task.md'),
        task,
        'utf8',
      );

      await expect(startTask('task-002', { baseDir: tmpDir })).rejects.toMatchObject({
        code: ErrorCode.GATE_VIOLATION,
      });
    });

    it('should throw SPEC_NOT_FOUND if spec is referenced but missing', async () => {
      // Create task with non-existent spec
      const task = `---
id: task-003
version: 1
status: In Progress
spec: feature-nonexistent
schema_version: "3.0"
---
# Task without spec
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-003 - Task without spec.md'),
        task,
        'utf8',
      );

      await expect(startTask('task-003', { baseDir: tmpDir })).rejects.toMatchObject({
        code: ErrorCode.SPEC_NOT_FOUND,
      });
    });

    it('should throw SPEC_NOT_FOUND if task has no spec reference', async () => {
      // Create task without spec
      const task = `---
id: task-004
version: 1
status: In Progress
schema_version: "3.0"
---
# Task without spec
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-004 - Task without spec.md'),
        task,
        'utf8',
      );

      await expect(startTask('task-004', { baseDir: tmpDir })).rejects.toMatchObject({
        code: ErrorCode.SPEC_NOT_FOUND,
      });
    });

    it('should include review documents if they exist', async () => {
      // Create spec
      const spec = `---
id: feature-test
---
# Test Feature
`;
      await fs.writeFile(path.join(tmpDir, 'specs', 'feature-test.md'), spec, 'utf8');

      // Create task
      const task = `---
id: task-005
version: 1
status: In Progress
spec: feature-test
schema_version: "3.0"
---
# Test task
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-005 - Test task.md'),
        task,
        'utf8',
      );

      // Create review document
      const review = `# Review for task-005
Status: Approved
`;
      await fs.writeFile(path.join(tmpDir, 'reviews', 'review-task-005.md'), review, 'utf8');

      const result = await startTask('task-005', { baseDir: tmpDir });

      expect(result.reviews).toHaveLength(1);
      expect(result.reviews[0].path).toContain('review-task-005.md');
    });
  });

  describe('suggestNextStep', () => {
    it('should suggest next uncompleted acceptance criterion', async () => {
      // Create task with mixed criteria
      const task = `---
id: task-101
version: 1
status: In Progress
schema_version: "3.0"
---
# Feature implementation

## Acceptance Criteria
- [x] First item completed
- [ ] Second item pending
- [ ] Third item pending
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-101 - Feature implementation.md'),
        task,
        'utf8',
      );

      const result = await suggestNextStep('task-101', undefined, { baseDir: tmpDir });

      expect(result.step.description).toBe('Second item pending');
      expect(result.step.estimated_complexity).toBeDefined();
      expect(['small', 'medium', 'large']).toContain(result.step.estimated_complexity);
    });

    it('should estimate complexity based on keywords', async () => {
      // Create task with unit test item
      const task = `---
id: task-102
version: 1
status: In Progress
schema_version: "3.0"
---
# Test task

## Acceptance Criteria
- [ ] Add unit tests for validation logic
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-102 - Test task.md'),
        task,
        'utf8',
      );

      const result = await suggestNextStep('task-102', undefined, { baseDir: tmpDir });

      expect(result.step.estimated_complexity).toBe('small');
    });

    it('should throw GATE_VIOLATION if task is not in progress', async () => {
      const task = `---
id: task-103
version: 1
status: Done
schema_version: "3.0"
---
# Completed task
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-103 - Completed task.md'),
        task,
        'utf8',
      );

      await expect(
        suggestNextStep('task-103', undefined, { baseDir: tmpDir }),
      ).rejects.toMatchObject({
        code: ErrorCode.GATE_VIOLATION,
      });
    });
  });

  describe('updateTaskStatus', () => {
    it('should successfully update task status following transitions', async () => {
      // Create task in "In Progress"
      const task = `---
id: task-201
version: 1
status: In Progress
schema_version: "3.0"
---
# Task to review
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-201 - Task to review.md'),
        task,
        'utf8',
      );

      const result = await updateTaskStatus(
        {
          taskId: 'task-201',
          version: 1,
          status: 'In Review',
        },
        { baseDir: tmpDir },
      );

      expect(result.success).toBe(true);
      expect(result.meta.status).toBe('In Review');
      expect(result.meta.version).toBe(2);
    });

    it('should throw INVALID_TRANSITION for disallowed transitions', async () => {
      // Create task in "Backlog"
      const task = `---
id: task-202
version: 1
status: Backlog
schema_version: "3.0"
---
# Task in backlog
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-202 - Task in backlog.md'),
        task,
        'utf8',
      );

      // Try to move directly to "Done" (not allowed)
      await expect(
        updateTaskStatus(
          {
            taskId: 'task-202',
            version: 1,
            status: 'Done',
          },
          { baseDir: tmpDir },
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_TRANSITION,
      });
    });

    it('should throw CONFLICT_DETECTED on version mismatch', async () => {
      const task = `---
id: task-203
version: 5
status: In Progress
schema_version: "3.0"
---
# Versioned task
`;
      await fs.writeFile(
        path.join(tmpDir, 'backlog', 'task-203 - Versioned task.md'),
        task,
        'utf8',
      );

      await expect(
        updateTaskStatus(
          {
            taskId: 'task-203',
            version: 3, // Wrong version
            status: 'In Review',
          },
          { baseDir: tmpDir },
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.CONFLICT_DETECTED,
      });
    });
  });
});
