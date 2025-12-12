import { describe, it, expect } from 'vitest';
import { getRegisteredTools, registerTool, getTool } from '../src/index.js';

describe('Tool Registry', () => {
  it('should have placeholder tools registered', () => {
    const tools = getRegisteredTools();
    expect(tools.length).toBeGreaterThan(0);
    // Tool names use underscores per MCP naming convention
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('tasks_get');
    expect(toolNames).toContain('kanban_get_board');
  });

  it('should allow registering a new tool', () => {
    const handler = () => ({ success: true });
    registerTool('test.tool', handler);
    expect(getTool('test.tool')).toBe(handler);
  });

  it('should return undefined for unregistered tools', () => {
    expect(getTool('nonexistent.tool')).toBeUndefined();
  });
});
