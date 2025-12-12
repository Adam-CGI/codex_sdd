import path from 'node:path';

/**
 * Normalize any spec reference format to a resolvable absolute path.
 *
 * Input formats accepted:
 *   - "feature-sample" (bare ID)
 *   - "feature-sample.md" (filename)
 *   - "specs/feature-sample.md" (relative path)
 *
 * Output: Absolute path to spec file
 *
 * @example
 * resolveSpecPath('feature-sample', '/repo') // => '/repo/specs/feature-sample.md'
 * resolveSpecPath('specs/feature-sample.md', '/repo') // => '/repo/specs/feature-sample.md'
 */
export function resolveSpecPath(specRef: string, baseDir: string): string {
  const specId = toSpecId(specRef);
  return path.join(baseDir, 'specs', `${specId}.md`);
}

/**
 * Extract bare spec ID from any format.
 *
 * Input formats accepted:
 *   - "feature-sample" (bare ID) => "feature-sample"
 *   - "feature-sample.md" (filename) => "feature-sample"
 *   - "specs/feature-sample.md" (relative path) => "feature-sample"
 *
 * @example
 * toSpecId('specs/feature-sample.md') // => 'feature-sample'
 * toSpecId('feature-sample') // => 'feature-sample'
 */
export function toSpecId(specRef: string): string {
  return specRef
    .replace(/^specs[/\\]/, '') // Remove leading specs/ or specs\
    .replace(/\.md$/, ''); // Remove trailing .md
}

/**
 * Normalize a spec reference for consistent storage.
 * Always returns just the spec ID (e.g., "feature-sample").
 *
 * This is the canonical format for storing spec references in task metadata.
 */
export function normalizeSpecRef(specRef: string): string {
  return toSpecId(specRef);
}

/**
 * Check if a string looks like a spec path (contains / or ends with .md)
 * vs a bare spec ID.
 */
export function isSpecPath(specRef: string): boolean {
  return specRef.includes('/') || specRef.includes('\\') || specRef.endsWith('.md');
}
