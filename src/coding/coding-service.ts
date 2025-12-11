import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Errors } from '../shared/errors.js';
import { getTaskById, type TaskDocument, type TaskMeta } from '../backlog/task-store.js';
import { loadConfig } from '../config/config-loader.js';
import { readSpec, type SpecDocument } from '../specs/spec-store.js';
import { moveTask } from '../backlog/task-move.js';

export interface StartTaskOptions {
  baseDir?: string;
  callerId?: string;
}

export interface StartTaskResult {
  task: {
    meta: TaskMeta;
    sections: Record<string, string>;
  };
  spec: {
    id: string;
    path: string;
    summary: string;
  };
  architecture: {
    rules_path: string;
    notes: string[];
  };
  git: {
    current_branch: string;
    task_branch?: string;
  };
  reviews: Array<{
    path: string;
    review_status?: string;
  }>;
  relevant_files: string[];
}

export interface SuggestNextStepOptions {
  baseDir?: string;
  callerId?: string;
}

export interface SuggestNextStepResult {
  step: {
    description: string;
    estimated_complexity: 'small' | 'medium' | 'large';
    expected_files: string[];
  };
}

export interface UpdateTaskStatusOptions {
  baseDir?: string;
  callerId?: string;
}

export interface UpdateTaskStatusParams {
  taskId: string;
  version: number;
  status: string;
  notes?: string;
}

export interface UpdateTaskStatusResult {
  success: true;
  meta: TaskMeta;
}

/**
 * Check if a task is in an allowed "in-progress" state for coding operations.
 */
async function enforceGate(
  task: TaskDocument,
  baseDir: string,
  callerId?: string,
): Promise<void> {
  const { config } = await loadConfig(baseDir);
  const inProgressSet = new Set(config.in_progress_statuses ?? []);

  if (!task.meta.status || !inProgressSet.has(task.meta.status)) {
    throw Errors.gateViolation(
      task.meta.id,
      task.meta.status ?? 'undefined',
      Array.from(inProgressSet),
    );
  }
}

/**
 * Start coding on a task. Returns task details, spec summary, architecture rules,
 * git context, and review documents.
 */
export async function startTask(
  taskId: string,
  options: StartTaskOptions = {},
): Promise<StartTaskResult> {
  const baseDir = options.baseDir ?? process.cwd();

  // Load task
  const task = await getTaskById(taskId, { baseDir });

  // Enforce gate: task must be in "in_progress_statuses"
  await enforceGate(task, baseDir, options.callerId);

  // Load spec if referenced
  let spec: StartTaskResult['spec'];
  if (task.meta.spec) {
    const specPath = path.join(baseDir, 'specs', `${task.meta.spec}.md`);
    try {
      const specDoc = await readSpec(specPath);
      spec = {
        id: specDoc.meta.id,
        path: specDoc.path,
        summary: generateSpecSummary(specDoc),
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'SPEC_NOT_FOUND') {
        throw Errors.specNotFound(task.meta.spec as string);
      }
      throw error;
    }
  } else {
    // No spec referenced - this could be a warning but per acceptance criteria we error
    throw Errors.specNotFound('(no spec referenced in task)');
  }

  // Load architecture rules
  const rulesPath = path.join(baseDir, 'architecture', 'rules.yaml');
  const architecture: StartTaskResult['architecture'] = {
    rules_path: rulesPath,
    notes: await extractArchitectureNotes(rulesPath),
  };

  // Git context - simplified placeholder (would use git wrapper in full implementation)
  const git: StartTaskResult['git'] = {
    current_branch: 'main', // Placeholder - would use simple-git
    task_branch: task.meta.branch as string | undefined,
  };

  // Load review documents
  const reviews = await findReviewDocs(taskId, baseDir);

  // Identify relevant files from task sections
  const relevant_files = extractRelevantFiles(task);

  return {
    task: {
      meta: task.meta,
      sections: task.sections,
    },
    spec,
    architecture,
    git,
    reviews,
    relevant_files,
  };
}

/**
 * Suggest the next step for a task based on current context.
 */
export async function suggestNextStep(
  taskId: string,
  currentDiffContext?: string,
  options: SuggestNextStepOptions = {},
): Promise<SuggestNextStepResult> {
  const baseDir = options.baseDir ?? process.cwd();

  // Load task
  const task = await getTaskById(taskId, { baseDir });

  // Enforce gate
  await enforceGate(task, baseDir, options.callerId);

  // Generate step suggestion based on task sections
  const step = generateNextStep(task, currentDiffContext);

  return { step };
}

/**
 * Update task status, enforcing transition rules and gate.
 */
export async function updateTaskStatus(
  params: UpdateTaskStatusParams,
  options: UpdateTaskStatusOptions = {},
): Promise<UpdateTaskStatusResult> {
  const baseDir = options.baseDir ?? process.cwd();

  // Use existing moveTask logic which already handles transitions and gates
  const result = await moveTask(
    {
      taskId: params.taskId,
      version: params.version,
      toStatus: params.status,
      force: false,
    },
    {
      baseDir,
      callerId: options.callerId,
    },
  );

  return {
    success: true,
    meta: result.meta,
  };
}

// Helper functions

function generateSpecSummary(spec: SpecDocument): string {
  const parts: string[] = [];

  if (spec.title) {
    parts.push(`Title: ${spec.title}`);
  }

  if (spec.preamble) {
    parts.push(`Preamble: ${spec.preamble.slice(0, 200)}...`);
  }

  if (spec.sectionOrder.length > 0) {
    parts.push(`Sections: ${spec.sectionOrder.join(', ')}`);
  }

  return parts.join('\n');
}

async function extractArchitectureNotes(rulesPath: string): Promise<string[]> {
  try {
    await fs.access(rulesPath);
    return [
      'Architecture rules found at: ' + rulesPath,
      'Review layering constraints and prohibited patterns before implementing',
    ];
  } catch (error) {
    return ['No architecture rules file found'];
  }
}

async function findReviewDocs(
  taskId: string,
  baseDir: string,
): Promise<Array<{ path: string; review_status?: string }>> {
  const reviewsDir = path.join(baseDir, 'reviews');

  try {
    const entries = await fs.readdir(reviewsDir);
    const matches = entries.filter((name) => name.includes(taskId) && name.endsWith('.md'));
    return matches.map((name) => ({
      path: path.join(reviewsDir, name),
      review_status: undefined, // Would parse from review doc in full implementation
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function extractRelevantFiles(task: TaskDocument): string[] {
  const files: string[] = [];

  // Extract from Implementation Notes section if present
  const implNotes = task.sections['Implementation Notes'];
  if (implNotes) {
    const matches = implNotes.match(/`[^`]+\.(ts|js|yaml|json|md)`/g) ?? [];
    files.push(...matches.map((m) => m.slice(1, -1)));
  }

  // Extract from Acceptance Criteria
  const criteria = task.sections['Acceptance Criteria'];
  if (criteria) {
    const matches = criteria.match(/`[^`]+\.(ts|js|yaml|json|md)`/g) ?? [];
    files.push(...matches.map((m) => m.slice(1, -1)));
  }

  return [...new Set(files)]; // Remove duplicates
}

function generateNextStep(task: TaskDocument, diffContext?: string): {
  description: string;
  estimated_complexity: 'small' | 'medium' | 'large';
  expected_files: string[];
} {
  // Parse acceptance criteria to find uncompleted items
  const criteria = task.sections['Acceptance Criteria'] ?? '';
  const lines = criteria.split('\n');
  const uncompleted = lines.filter(
    (line) => line.trim().startsWith('- [ ]') || line.trim().startsWith('* [ ]'),
  );

  let description: string;
  let complexity: 'small' | 'medium' | 'large' = 'medium';

  if (uncompleted.length > 0) {
    description = uncompleted[0].replace(/^[-*]\s*\[\s*\]\s*/, '').trim();

    // Estimate complexity based on keywords
    const lowerDesc = description.toLowerCase();
    if (
      lowerDesc.includes('unit test') ||
      lowerDesc.includes('add') ||
      lowerDesc.includes('simple')
    ) {
      complexity = 'small';
    } else if (
      lowerDesc.includes('implement') ||
      lowerDesc.includes('create') ||
      lowerDesc.includes('design')
    ) {
      complexity = 'medium';
    } else if (
      lowerDesc.includes('refactor') ||
      lowerDesc.includes('migration') ||
      lowerDesc.includes('system')
    ) {
      complexity = 'large';
    }
  } else {
    description = 'Review and finalize implementation';
    complexity = 'small';
  }

  const expected_files = extractRelevantFiles(task);

  return {
    description,
    estimated_complexity: complexity,
    expected_files,
  };
}
