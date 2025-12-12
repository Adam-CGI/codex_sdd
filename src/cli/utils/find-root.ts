/**
 * Find the SDD project root by looking for backlog/config.yaml
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';

export function findProjectRoot(startPath: string = process.cwd()): string | null {
  let currentPath = startPath;

  // Maximum depth to prevent infinite loop
  const maxDepth = 20;
  let depth = 0;

  while (depth < maxDepth) {
    const configPath = join(currentPath, 'backlog', 'config.yaml');

    if (existsSync(configPath)) {
      return currentPath;
    }

    const parentPath = dirname(currentPath);

    // Reached filesystem root
    if (parentPath === currentPath) {
      return null;
    }

    currentPath = parentPath;
    depth++;
  }

  return null;
}

export function requireProjectRoot(): string {
  const root = findProjectRoot();

  if (!root) {
    throw new Error(
      'Not in an SDD project. Run "sdd init" to initialize a project.'
    );
  }

  return root;
}
