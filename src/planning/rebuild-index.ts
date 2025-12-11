/**
 * Placeholder index rebuild hook.
 * Task-012 will implement the real generator; this stub keeps callers working.
 */
export async function rebuildIndex(_baseDir = process.cwd()): Promise<void> {
  // no-op for now
}

export const planningRebuildIndex = {
  name: 'planning.rebuild_index',
  handler: async () => {
    await rebuildIndex(process.cwd());
    return { success: true, data: { index_path: 'backlog/index.json' } };
  },
};
