import { promises as fs } from 'node:fs';
import { FSWatcher, watch } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import {
  ErrorCode,
  McpError,
  createErrorEnvelope,
  type ErrorEnvelope,
} from '../shared/errors.js';

const CONFIG_RELATIVE_PATH = path.join('backlog', 'config.yaml');
const DEFAULT_SCHEMA_VERSION = '3.0';

export interface KanbanConfig {
  schema_version: string;
  statuses: string[];
  in_progress_statuses: string[];
  transitions: Record<string, string[]>;
  roles: Record<string, string[]>;
  columns: Record<string, string>;
  unknown?: Record<string, unknown>;
}

export interface LoadedConfig {
  config: KanbanConfig;
  source: 'file' | 'default';
  path: string;
  warnings: ErrorEnvelope[];
  raw: Record<string, unknown>;
}

const DEFAULT_CONFIG: KanbanConfig = {
  schema_version: DEFAULT_SCHEMA_VERSION,
  statuses: ['Backlog', 'Ready', 'In Progress', 'In Review', 'Done'],
  in_progress_statuses: ['In Progress'],
  transitions: {},
  roles: {},
  columns: {},
};

let cachedConfig: LoadedConfig | null = null;
let cachedRoot: string | null = null;
let watcher: FSWatcher | null = null;

export function getCachedConfig(): LoadedConfig | null {
  return cachedConfig;
}

export async function reloadConfig(baseDir = cachedRoot ?? process.cwd()): Promise<LoadedConfig> {
  return loadConfig(baseDir);
}

export function startConfigWatcher(
  baseDir = process.cwd(),
  onReload?: (config: LoadedConfig) => void,
): void {
  stopConfigWatcher();
  const configPath = path.join(baseDir, CONFIG_RELATIVE_PATH);
  watcher = watch(configPath, { persistent: false }, async () => {
    try {
      const result = await loadConfig(baseDir);
      onReload?.(result);
    } catch (error) {
      // Swallow watcher errors; consumer can call reloadConfig explicitly
      console.warn('[config-loader] reload failed:', (error as Error).message);
    }
  });
  cachedRoot = baseDir;
}

export function stopConfigWatcher(): void {
  watcher?.close();
  watcher = null;
}

export async function loadConfig(baseDir = process.cwd()): Promise<LoadedConfig> {
  const configPath = path.join(baseDir, CONFIG_RELATIVE_PATH);
  cachedRoot = baseDir;

  let raw: Record<string, unknown> = {};
  let source: LoadedConfig['source'] = 'file';
  const warnings: ErrorEnvelope[] = [];

  try {
    const content = await fs.readFile(configPath, 'utf8');
    raw = (YAML.parse(content) ?? {}) as Record<string, unknown>;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      source = 'default';
      warnings.push(
        createErrorEnvelope(ErrorCode.CONFIG_NOT_FOUND, 'Configuration file not found', {
          path: configPath,
        }),
      );
    } else if ((error as Error).name === 'YAMLParseError') {
      throw new McpError(
        ErrorCode.CONFIG_INVALID,
        `Failed to parse ${configPath}: ${(error as Error).message}`,
      );
    } else {
      throw error;
    }
  }

  const config =
    source === 'default'
      ? { ...DEFAULT_CONFIG }
      : validateAndBuildConfig(raw, configPath);

  const loaded: LoadedConfig = {
    config,
    source,
    path: configPath,
    warnings,
    raw,
  };

  cachedConfig = loaded;
  return loaded;
}

function validateAndBuildConfig(
  raw: Record<string, unknown>,
  configPath: string,
): KanbanConfig {
  const schemaVersion = (raw.schema_version as string | undefined) ?? DEFAULT_SCHEMA_VERSION;
  if (schemaVersion !== DEFAULT_SCHEMA_VERSION) {
    throw new McpError(
      ErrorCode.CONFIG_INVALID,
      `Unsupported schema_version "${schemaVersion}" in ${configPath}`,
    );
  }

  const statuses = extractStringArray(raw.statuses, 'statuses', DEFAULT_CONFIG.statuses);
  if (statuses.length === 0) {
    throw new McpError(ErrorCode.CONFIG_INVALID, 'statuses must contain at least one value');
  }

  const inProgress = extractStringArray(
    raw.in_progress_statuses,
    'in_progress_statuses',
    DEFAULT_CONFIG.in_progress_statuses,
  );
  for (const status of inProgress) {
    if (!statuses.includes(status)) {
      throw new McpError(
        ErrorCode.CONFIG_INVALID,
        `in_progress_status "${status}" is not defined in statuses`,
      );
    }
  }

  const transitionsRaw = raw.transitions as Record<string, unknown> | undefined;
  const transitions =
    transitionsRaw === undefined
      ? { ...DEFAULT_CONFIG.transitions }
      : validateTransitions(transitionsRaw, statuses);

  const rolesRaw = raw.roles as Record<string, unknown> | undefined;
  const roles =
    rolesRaw === undefined ? { ...DEFAULT_CONFIG.roles } : validateRoles(rolesRaw, 'roles');

  const columnsRaw = raw.columns as Record<string, unknown> | undefined;
  const columns =
    columnsRaw === undefined ? { ...DEFAULT_CONFIG.columns } : validateColumns(columnsRaw);

  const knownKeys = new Set([
    'schema_version',
    'statuses',
    'in_progress_statuses',
    'transitions',
    'roles',
    'columns',
  ]);
  const unknown: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!knownKeys.has(key)) {
      unknown[key] = value;
    }
  }

  const config: KanbanConfig = {
    schema_version: schemaVersion,
    statuses,
    in_progress_statuses: inProgress,
    transitions,
    roles,
    columns,
    unknown: Object.keys(unknown).length > 0 ? unknown : undefined,
  };

  return config;
}

function extractStringArray(
  value: unknown,
  field: string,
  fallback: string[],
): string[] {
  if (value === undefined || value === null) {
    return [...fallback];
  }

  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new McpError(
      ErrorCode.CONFIG_INVALID,
      `${field} must be an array of strings`,
    );
  }

  return [...value];
}

function validateTransitions(
  transitions: Record<string, unknown>,
  statuses: string[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const [from, targets] of Object.entries(transitions)) {
    if (!statuses.includes(from)) {
      throw new McpError(
        ErrorCode.CONFIG_INVALID,
        `Transition key "${from}" is not defined in statuses`,
      );
    }

    if (!Array.isArray(targets) || !targets.every((v) => typeof v === 'string')) {
      throw new McpError(
        ErrorCode.CONFIG_INVALID,
        `Transitions for "${from}" must be an array of strings`,
      );
    }

    for (const to of targets) {
      if (!statuses.includes(to)) {
        throw new McpError(
          ErrorCode.CONFIG_INVALID,
          `Transition target "${to}" is not defined in statuses`,
        );
      }
    }

    result[from] = [...targets];
  }

  return result;
}

function validateRoles(
  roles: Record<string, unknown>,
  field: string,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const [role, members] of Object.entries(roles)) {
    if (!Array.isArray(members) || !members.every((v) => typeof v === 'string')) {
      throw new McpError(
        ErrorCode.CONFIG_INVALID,
        `${field}.${role} must be an array of strings`,
      );
    }
    result[role] = [...members];
  }

  return result;
}

function validateColumns(columns: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(columns)) {
    if (typeof value !== 'string') {
      throw new McpError(
        ErrorCode.CONFIG_INVALID,
        `columns.${key} must be a string`,
      );
    }
    result[key] = value;
  }

  return result;
}
