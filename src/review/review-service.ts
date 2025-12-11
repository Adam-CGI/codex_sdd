/**
 * Review service - implements review tools for code review workflow
 * Implements: review.analyze_diff, review.write_review_doc, review.summarize_task_reviews
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { Errors, McpError, ErrorCode, wrapWithErrorHandling } from '../shared/errors.js';
import { getTaskById } from '../backlog/task-store.js';
import { loadArchitectureRules } from '../arch/rules-store.js';

export interface ReviewIssue {
  id: string;
  description: string;
  file?: string;
  line?: number;
}

export type ReviewStatus = 'Changes Requested' | 'Approved' | 'Informational';

export interface AnalyzeDiffParams {
  base_ref: string;
  head_ref: string;
  task_id?: string;
}

export interface AnalyzeDiffResult {
  summary: string;
  review_status: ReviewStatus;
  blocking_issues: ReviewIssue[];
  non_blocking_suggestions: ReviewIssue[];
  notes: string[];
}

export interface WriteReviewDocParams {
  task_id: string;
  review: AnalyzeDiffResult;
}

export interface WriteReviewDocResult {
  success: true;
  review_path: string;
}

export interface SummarizeReviewsParams {
  task_id: string;
}

export interface SummarizeReviewsResult {
  task_id: string;
  current_status: ReviewStatus | 'None';
  open_blocking_issues: ReviewIssue[];
  open_non_blocking_suggestions: ReviewIssue[];
}

export interface ReviewServiceOptions {
  baseDir?: string;
}

/**
 * Analyze a git diff between two refs and produce a review
 */
export async function analyzeDiff(
  params: AnalyzeDiffParams,
  options: ReviewServiceOptions = {}
): Promise<AnalyzeDiffResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const git = simpleGit(baseDir);

  const { base_ref, head_ref, task_id } = params;

  // Verify refs exist
  try {
    await git.revparse([base_ref]);
  } catch {
    throw Errors.branchNotFound(base_ref);
  }

  try {
    await git.revparse([head_ref]);
  } catch {
    throw Errors.branchNotFound(head_ref);
  }

  // If task_id provided, verify task exists
  if (task_id) {
    await getTaskById(task_id, { baseDir });
  }

  // Get the diff
  const diffSummary = await git.diffSummary([base_ref, head_ref]);
  const diffOutput = await git.diff([base_ref, head_ref]);

  const blocking_issues: ReviewIssue[] = [];
  const non_blocking_suggestions: ReviewIssue[] = [];
  const notes: string[] = [];
  let issueCounter = 1;

  // Analyze files changed
  const filesChanged = diffSummary.files.length;
  const insertions = diffSummary.insertions;
  const deletions = diffSummary.deletions;

  notes.push(`Files changed: ${filesChanged}`);
  notes.push(`Lines added: ${insertions}, Lines removed: ${deletions}`);

  // Check for architecture violations in changed files
  try {
    const archRules = await loadArchitectureRules(baseDir);
    const archViolations = analyzeArchitectureViolations(diffOutput, archRules);

    for (const violation of archViolations) {
      if (violation.severity === 'error') {
        blocking_issues.push({
          id: `REV-${issueCounter++}`,
          description: `Architecture violation: ${violation.description}`,
          file: violation.file,
          line: violation.line,
        });
      } else {
        non_blocking_suggestions.push({
          id: `REV-${issueCounter++}`,
          description: `Architecture note: ${violation.description}`,
          file: violation.file,
          line: violation.line,
        });
      }
    }
  } catch (error) {
    // Architecture rules may not exist - that's okay
    if (!(error instanceof McpError && error.code === ErrorCode.RULE_PARSE_ERROR)) {
      notes.push('Architecture rules not available for validation');
    }
  }

  // Check for common issues in diff
  const commonIssues = analyzeCommonIssues(diffOutput);
  for (const issue of commonIssues.blocking) {
    blocking_issues.push({
      id: `REV-${issueCounter++}`,
      ...issue,
    });
  }
  for (const suggestion of commonIssues.nonBlocking) {
    non_blocking_suggestions.push({
      id: `REV-${issueCounter++}`,
      ...suggestion,
    });
  }

  // Determine review status
  let review_status: ReviewStatus;
  if (blocking_issues.length > 0) {
    review_status = 'Changes Requested';
  } else if (non_blocking_suggestions.length > 0) {
    review_status = 'Informational';
  } else {
    review_status = 'Approved';
  }

  // Generate summary
  const summary = generateSummary(diffSummary.files, review_status, blocking_issues.length, non_blocking_suggestions.length);

  return {
    summary,
    review_status,
    blocking_issues,
    non_blocking_suggestions,
    notes,
  };
}

/**
 * Write a review document to the reviews directory
 */
export async function writeReviewDoc(
  params: WriteReviewDocParams,
  options: ReviewServiceOptions = {}
): Promise<WriteReviewDocResult> {
  const baseDir = options.baseDir ?? process.cwd();

  const { task_id, review } = params;

  // Verify task exists
  await getTaskById(task_id, { baseDir });

  // Create reviews directory if needed
  const reviewsDir = path.join(baseDir, 'reviews');
  await fs.mkdir(reviewsDir, { recursive: true });

  // Generate review filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `review-${task_id}-${timestamp}.md`;
  const reviewPath = path.join(reviewsDir, filename);

  // Build review document
  const content = buildReviewDocument(task_id, review);

  await fs.writeFile(reviewPath, content, 'utf8');

  return {
    success: true,
    review_path: reviewPath,
  };
}

/**
 * Summarize all reviews for a task
 */
export async function summarizeTaskReviews(
  params: SummarizeReviewsParams,
  options: ReviewServiceOptions = {}
): Promise<SummarizeReviewsResult> {
  const baseDir = options.baseDir ?? process.cwd();

  const { task_id } = params;

  // Verify task exists
  await getTaskById(task_id, { baseDir });

  // Find review files for this task
  const reviewsDir = path.join(baseDir, 'reviews');
  let reviewFiles: string[] = [];

  try {
    const entries = await fs.readdir(reviewsDir);
    reviewFiles = entries
      .filter((name) => name.startsWith(`review-${task_id}`) && name.endsWith('.md'))
      .sort()
      .reverse(); // Most recent first
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  if (reviewFiles.length === 0) {
    return {
      task_id,
      current_status: 'None',
      open_blocking_issues: [],
      open_non_blocking_suggestions: [],
    };
  }

  // Parse the most recent review
  const latestReviewPath = path.join(reviewsDir, reviewFiles[0]);
  const latestReview = await parseReviewDocument(latestReviewPath);

  return {
    task_id,
    current_status: latestReview.status,
    open_blocking_issues: latestReview.blocking,
    open_non_blocking_suggestions: latestReview.nonBlocking,
  };
}

// Tool exports for MCP registration
export const reviewAnalyzeDiff = {
  name: 'review.analyze_diff',
  handler: async (params: AnalyzeDiffParams) =>
    wrapWithErrorHandling(() => analyzeDiff(params, { baseDir: process.cwd() })),
};

export const reviewWriteReviewDoc = {
  name: 'review.write_review_doc',
  handler: async (params: WriteReviewDocParams) =>
    wrapWithErrorHandling(() => writeReviewDoc(params, { baseDir: process.cwd() })),
};

export const reviewSummarizeTaskReviews = {
  name: 'review.summarize_task_reviews',
  handler: async (params: SummarizeReviewsParams) =>
    wrapWithErrorHandling(() => summarizeTaskReviews(params, { baseDir: process.cwd() })),
};

// Helper functions

interface ArchViolation {
  severity: 'error' | 'warning';
  description: string;
  file?: string;
  line?: number;
}

function analyzeArchitectureViolations(
  diffOutput: string,
  archRules: { layers: Array<{ name: string; path: string }>; prohibitedPatterns: Array<{ pattern: string; regex: RegExp }> }
): ArchViolation[] {
  const violations: ArchViolation[] = [];

  // Check prohibited patterns in added lines
  const addedLines = diffOutput
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'));

  for (const pattern of archRules.prohibitedPatterns) {
    for (const line of addedLines) {
      if (pattern.regex.test(line)) {
        violations.push({
          severity: 'error',
          description: `Prohibited pattern "${pattern.pattern}" found in added code`,
        });
        break; // One violation per pattern is enough
      }
    }
  }

  return violations;
}

interface CommonIssue {
  description: string;
  file?: string;
  line?: number;
}

function analyzeCommonIssues(diffOutput: string): { blocking: CommonIssue[]; nonBlocking: CommonIssue[] } {
  const blocking: CommonIssue[] = [];
  const nonBlocking: CommonIssue[] = [];

  const lines = diffOutput.split('\n');
  let currentFile = '';
  let lineNumber = 0;

  for (const line of lines) {
    // Track current file
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      lineNumber = 0;
      continue;
    }

    // Track line numbers from hunk headers
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      lineNumber = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    // Count lines in added content
    if (line.startsWith('+') || line.startsWith(' ')) {
      lineNumber++;
    }

    // Only check added lines
    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }

    const addedContent = line.slice(1);

    // Check for console.log in non-test files
    if (
      /console\.(log|debug|info)\s*\(/.test(addedContent) &&
      !currentFile.includes('.test.') &&
      !currentFile.includes('.spec.')
    ) {
      nonBlocking.push({
        description: 'Console statement found - consider removing before production',
        file: currentFile,
        line: lineNumber,
      });
    }

    // Check for TODO/FIXME comments
    if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(addedContent)) {
      nonBlocking.push({
        description: 'TODO/FIXME comment found - ensure this is tracked',
        file: currentFile,
        line: lineNumber,
      });
    }

    // Check for hardcoded secrets patterns
    if (/(?:password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]+['"]/i.test(addedContent)) {
      blocking.push({
        description: 'Possible hardcoded secret detected - use environment variables',
        file: currentFile,
        line: lineNumber,
      });
    }

    // Check for debugger statements
    if (/\bdebugger\b/.test(addedContent)) {
      blocking.push({
        description: 'Debugger statement found - remove before merging',
        file: currentFile,
        line: lineNumber,
      });
    }
  }

  return { blocking, nonBlocking };
}

function generateSummary(
  files: Array<{ file: string }>,
  status: ReviewStatus,
  blockingCount: number,
  suggestionCount: number
): string {
  const fileList = files.slice(0, 5).map((f) => f.file);
  const moreFiles = files.length > 5 ? ` and ${files.length - 5} more` : '';

  const parts: string[] = [];
  parts.push(`Review status: ${status}`);
  parts.push(`Modified files: ${fileList.join(', ')}${moreFiles}`);

  if (blockingCount > 0) {
    parts.push(`Blocking issues: ${blockingCount}`);
  }
  if (suggestionCount > 0) {
    parts.push(`Suggestions: ${suggestionCount}`);
  }

  return parts.join('\n');
}

function buildReviewDocument(taskId: string, review: AnalyzeDiffResult): string {
  const lines: string[] = [];

  lines.push('---');
  lines.push(`task_id: ${taskId}`);
  lines.push(`review_status: ${review.review_status}`);
  lines.push(`created: ${new Date().toISOString()}`);
  lines.push('---');
  lines.push('');
  lines.push(`# Review for ${taskId}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(review.summary);
  lines.push('');

  if (review.blocking_issues.length > 0) {
    lines.push('## Blocking Issues');
    for (const issue of review.blocking_issues) {
      const location = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})` : '';
      lines.push(`- **${issue.id}**: ${issue.description}${location}`);
    }
    lines.push('');
  }

  if (review.non_blocking_suggestions.length > 0) {
    lines.push('## Suggestions');
    for (const suggestion of review.non_blocking_suggestions) {
      const location = suggestion.file ? ` (${suggestion.file}${suggestion.line ? `:${suggestion.line}` : ''})` : '';
      lines.push(`- **${suggestion.id}**: ${suggestion.description}${location}`);
    }
    lines.push('');
  }

  if (review.notes.length > 0) {
    lines.push('## Notes');
    for (const note of review.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function parseReviewDocument(
  reviewPath: string
): Promise<{ status: ReviewStatus | 'None'; blocking: ReviewIssue[]; nonBlocking: ReviewIssue[] }> {
  const content = await fs.readFile(reviewPath, 'utf8');
  const lines = content.split('\n');

  let status: ReviewStatus | 'None' = 'None';
  const blocking: ReviewIssue[] = [];
  const nonBlocking: ReviewIssue[] = [];

  let inBlocking = false;
  let inSuggestions = false;

  for (const line of lines) {
    // Parse frontmatter status
    const statusMatch = line.match(/^review_status:\s*(.+)$/);
    if (statusMatch) {
      const rawStatus = statusMatch[1].trim();
      if (rawStatus === 'Changes Requested' || rawStatus === 'Approved' || rawStatus === 'Informational') {
        status = rawStatus;
      }
      continue;
    }

    // Track sections
    if (line.startsWith('## Blocking Issues')) {
      inBlocking = true;
      inSuggestions = false;
      continue;
    }
    if (line.startsWith('## Suggestions')) {
      inBlocking = false;
      inSuggestions = true;
      continue;
    }
    if (line.startsWith('## ')) {
      inBlocking = false;
      inSuggestions = false;
      continue;
    }

    // Parse issues
    const issueMatch = line.match(/^- \*\*([^*]+)\*\*:\s*(.+)$/);
    if (issueMatch) {
      const [, id, rest] = issueMatch;
      const locationMatch = rest.match(/^(.+?)\s*\(([^:]+)(?::(\d+))?\)$/);

      let description: string;
      let file: string | undefined;
      let issueLine: number | undefined;

      if (locationMatch) {
        description = locationMatch[1];
        file = locationMatch[2];
        if (locationMatch[3]) {
          issueLine = parseInt(locationMatch[3], 10);
        }
      } else {
        description = rest;
      }

      const issue: ReviewIssue = { id, description, file, line: issueLine };

      if (inBlocking) {
        blocking.push(issue);
      } else if (inSuggestions) {
        nonBlocking.push(issue);
      }
    }
  }

  return { status, blocking, nonBlocking };
}
