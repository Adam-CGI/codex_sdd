/**
 * Task create command
 */

import { logger } from '../utils/logger.js';
import { requireProjectRoot } from '../utils/find-root.js';
import { writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import ora from 'ora';

interface TaskCreateOptions {
  desc?: string;
  assignee?: string;
  status?: string;
  labels?: string;
  parent?: string;
  priority?: string;
  plan?: string;
  ac?: string[];
  notes?: string;
  dep?: string;
  draft?: boolean;
}

export async function taskCreateCommand(title: string, options: TaskCreateOptions) {
  const root = requireProjectRoot();
  const spinner = ora('Creating task...').start();

  try {
    // Generate next task ID
    const backlogPath = join(root, 'backlog');
    const files = readdirSync(backlogPath).filter((f) => f.startsWith('task-'));
    
    let maxId = 0;
    for (const file of files) {
      const match = file.match(/^task-(\d+)/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > maxId) maxId = id;
      }
    }
    
    const newId = maxId + 1;
    
    // Parse options
    const labels = options.labels ? options.labels.split(',').map(l => l.trim()) : [];
    const dependencies = options.dep ? options.dep.split(',').map(d => d.trim()) : [];
    const acceptanceCriteria = options.ac || [];
    
    // Create task metadata
    const taskMeta = {
      id: newId,
      title,
      // New tasks should go straight to architecture review by default
      status: options.status || 'Ready for Architecture Review',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      ...(options.assignee && { assignee: options.assignee }),
      ...(labels.length > 0 && { labels }),
      ...(options.priority && { priority: options.priority }),
      ...(options.parent && { parent: options.parent }),
      ...(dependencies.length > 0 && { dependencies }),
      ...(options.draft && { draft: true }),
    };

    // Create task content
    let content = '';
    
    if (options.desc) {
      content += `## Description\n\n${options.desc}\n\n`;
    }
    
    if (acceptanceCriteria.length > 0) {
      content += '## Acceptance Criteria\n\n';
      for (const ac of acceptanceCriteria) {
        content += `- [ ] ${ac}\n`;
      }
      content += '\n';
    }
    
    if (options.plan) {
      content += `## Implementation Plan\n\n${options.plan}\n\n`;
    }
    
    if (options.notes) {
      content += `## Notes\n\n${options.notes}\n\n`;
    }

    // Create task file
    const taskContent = matter.stringify(content, taskMeta);
    const filename = `task-${String(newId).padStart(3, '0')} - ${title}.md`;
    const filepath = join(backlogPath, filename);
    
    writeFileSync(filepath, taskContent);
    
    spinner.succeed(`Created task-${newId}: ${title}`);
    logger.dim(`File: ${filename}`);
    
    if (options.status) {
      logger.info(`Status: ${options.status}`);
    }
    
    if (options.assignee) {
      logger.info(`Assigned to: ${options.assignee}`);
    }
  } catch (error) {
    spinner.fail('Failed to create task');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
