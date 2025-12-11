import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getCachedConfig,
  loadConfig,
  reloadConfig,
} from '../src/config/config-loader.js';
import { ErrorCode, McpError } from '../src/shared/errors.js';

const DEFAULT_STATUSES = ['Backlog', 'Ready', 'In Progress', 'In Review', 'Done'];

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-loader-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('config-loader', () => {
  it('loads defaults when config file is missing and emits CONFIG_NOT_FOUND warning', async () => {
    const result = await loadConfig(tmpDir);

    expect(result.source).toBe('default');
    expect(result.warnings[0]?.error.code).toBe(ErrorCode.CONFIG_NOT_FOUND);
    expect(result.config.statuses).toEqual(DEFAULT_STATUSES);
    expect(result.config.in_progress_statuses).toEqual(['In Progress']);

    const cached = getCachedConfig();
    expect(cached?.source).toBe('default');
  });

  it('loads and validates a config file, preserving unknown keys', async () => {
    const backlogDir = path.join(tmpDir, 'backlog');
    await fs.mkdir(backlogDir, { recursive: true });
    const configPath = path.join(backlogDir, 'config.yaml');
    const yaml = `
schema_version: "3.0"
statuses:
  - Backlog
  - Ready
in_progress_statuses:
  - Ready
transitions:
  Backlog: ["Ready"]
roles:
  maintainers:
    - human:adam
columns:
  Backlog: Backlog
extra_field: 123
`;
    await fs.writeFile(configPath, yaml, 'utf8');

    const result = await loadConfig(tmpDir);

    expect(result.source).toBe('file');
    expect(result.warnings).toHaveLength(0);
    expect(result.config.statuses).toEqual(['Backlog', 'Ready']);
    expect(result.config.in_progress_statuses).toEqual(['Ready']);
    expect(result.config.transitions).toEqual({ Backlog: ['Ready'] });
    expect(result.config.roles).toEqual({ maintainers: ['human:adam'] });
    expect(result.config.columns).toEqual({ Backlog: 'Backlog' });
    expect(result.config.unknown?.extra_field).toBe(123);
    expect(result.raw.extra_field).toBe(123);
  });

  it('throws CONFIG_INVALID when schema_version is unsupported', async () => {
    const backlogDir = path.join(tmpDir, 'backlog');
    await fs.mkdir(backlogDir, { recursive: true });
    await fs.writeFile(
      path.join(backlogDir, 'config.yaml'),
      'schema_version: "2.0"\n',
      'utf8',
    );

    await expect(loadConfig(tmpDir)).rejects.toBeInstanceOf(McpError);
    await expect(loadConfig(tmpDir)).rejects.toHaveProperty(
      'code',
      ErrorCode.CONFIG_INVALID,
    );
  });

  it('throws CONFIG_INVALID when in_progress_statuses reference unknown status', async () => {
    const backlogDir = path.join(tmpDir, 'backlog');
    await fs.mkdir(backlogDir, { recursive: true });
    const yaml = `
schema_version: "3.0"
statuses:
  - Backlog
in_progress_statuses:
  - Missing
`;
    await fs.writeFile(path.join(backlogDir, 'config.yaml'), yaml, 'utf8');

    await expect(loadConfig(tmpDir)).rejects.toHaveProperty(
      'code',
      ErrorCode.CONFIG_INVALID,
    );
  });

  it('reloads and updates cached config after file change', async () => {
    const backlogDir = path.join(tmpDir, 'backlog');
    await fs.mkdir(backlogDir, { recursive: true });
    const configPath = path.join(backlogDir, 'config.yaml');

    await fs.writeFile(
      configPath,
      `
schema_version: "3.0"
statuses: ["Backlog", "Ready"]
in_progress_statuses: ["Ready"]
`,
      'utf8',
    );

    await loadConfig(tmpDir);
    const first = getCachedConfig();
    expect(first?.config.statuses).toEqual(['Backlog', 'Ready']);

    await fs.writeFile(
      configPath,
      `
schema_version: "3.0"
statuses: ["Todo", "Doing", "Done"]
in_progress_statuses: ["Doing"]
`,
      'utf8',
    );

    await reloadConfig(tmpDir);
    const reloaded = getCachedConfig();
    expect(reloaded?.config.statuses).toEqual(['Todo', 'Doing', 'Done']);
    expect(reloaded?.config.in_progress_statuses).toEqual(['Doing']);
  });
});
