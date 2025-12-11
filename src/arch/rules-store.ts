import { promises as fs } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { readSpec, SpecError } from '../specs/spec-store.js';
import { ErrorCode, Errors, McpError, wrapWithErrorHandling } from '../shared/errors.js';

export interface Layer {
  name: string;
  path: string;
}

export interface LayerRule {
  from: string;
  to: string;
  allow: boolean;
  raw: string;
}

export interface ProhibitedPattern {
  pattern: string;
  regex: RegExp;
  paths: string[];
}

export interface ArchitectureRules {
  layers: Layer[];
  rules: LayerRule[];
  prohibitedPatterns: ProhibitedPattern[];
  sourcePath: string;
  baseDir: string;
}

export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueType =
  | 'layering_violation'
  | 'pattern_violation'
  | 'missing_component'
  | 'ambiguous';

export interface ValidationIssue {
  id: string;
  severity: IssueSeverity;
  type: IssueType;
  description: string;
  suggestion?: string;
}

export interface ValidateSpecParams {
  specPath: string;
}

export interface ValidateSpecOptions {
  baseDir?: string;
  rules?: ArchitectureRules;
}

export interface ValidateSpecResult {
  spec_id: string;
  issues: ValidationIssue[];
}

export interface AnnotateParams {
  specPath: string;
  report: unknown;
}

export interface AnnotateResult {
  success: true;
}

interface PathMention {
  value: string;
  line: number;
}

interface LayerDependency {
  fromLayer: string;
  toLayer: string;
  evidence: string;
  line: number;
}

/**
 * Load and validate architecture rules from architecture/rules.yaml.
 */
export async function loadArchitectureRules(baseDir: string = process.cwd()): Promise<ArchitectureRules> {
  const rulesPath = path.join(baseDir, 'architecture', 'rules.yaml');
  let yamlText: string;

  try {
    yamlText = await fs.readFile(rulesPath, 'utf8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw Errors.ruleParseError(`Rules file not found at ${rulesPath}`);
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlText) ?? {};
  } catch (error) {
    throw Errors.ruleParseError((error as Error).message);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw Errors.ruleParseError('rules.yaml is empty or not an object');
  }

  const obj = parsed as Record<string, unknown>;
  const layers = parseLayers(obj.layers);
  const rules = parseRules(obj.rules, layers);
  const prohibitedPatterns = parseProhibitedPatterns(obj.patterns);

  return {
    layers,
    rules,
    prohibitedPatterns,
    sourcePath: rulesPath,
    baseDir,
  };
}

export async function validateSpec(
  params: ValidateSpecParams,
  options: ValidateSpecOptions = {},
): Promise<ValidateSpecResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const specPath = path.isAbsolute(params.specPath)
    ? params.specPath
    : path.join(baseDir, params.specPath);

  const spec = await readSpecOrThrow(specPath, params.specPath);
  const rules = options.rules ?? (await loadArchitectureRules(baseDir));

  const text = spec.rawBody;
  const lines = text.split(/\r?\n/);

  const issues: ValidationIssue[] = [];
  let issueCounter = 1;

  const pathMentions = extractPathMentions(lines);
  const layerLookup = buildLayerLookup(rules.layers);

  // Missing component: path without mapped layer
  const unmappedPaths = new Set<string>();
  for (const mention of pathMentions) {
    if (!mapPathToLayer(mention.value, layerLookup)) {
      if (!unmappedPaths.has(mention.value)) {
        unmappedPaths.add(mention.value);
        issues.push({
          id: `ARCH-${issueCounter++}`,
          severity: 'info',
          type: 'missing_component',
          description: `Path "${mention.value}" does not map to a known layer`,
          suggestion: 'Add a layer mapping or adjust the spec path prefix.',
        });
      }
    }
  }

  const dependencies = detectDependencies(lines, pathMentions, layerLookup);
  const ruleMap = buildRuleMap(rules.rules);
  const emittedLayerIssues = new Set<string>();

  for (const dep of dependencies) {
    const key = `${dep.fromLayer}->${dep.toLayer}`;
    const rule = ruleMap.get(key);

    if (rule && !rule.allow) {
      const dedupeKey = `deny:${key}`;
      if (emittedLayerIssues.has(dedupeKey)) continue;
      emittedLayerIssues.add(dedupeKey);
      issues.push({
        id: `ARCH-${issueCounter++}`,
        severity: 'error',
        type: 'layering_violation',
        description: `Layer "${dep.fromLayer}" is not allowed to depend on "${dep.toLayer}" (found near line ${dep.line}).`,
        suggestion: 'Refactor to respect layering rules or update architecture/rules.yaml.',
      });
      continue;
    }

    if (!rule) {
      const dedupeKey = `ambiguous:${key}`;
      if (emittedLayerIssues.has(dedupeKey)) continue;
      emittedLayerIssues.add(dedupeKey);
      issues.push({
        id: `ARCH-${issueCounter++}`,
        severity: 'warning',
        type: 'ambiguous',
        description: `No rule defined for dependency ${dep.fromLayer} → ${dep.toLayer} (line ${dep.line}).`,
        suggestion: 'Clarify the rule in architecture/rules.yaml or adjust design.',
      });
    }
  }

  const patternIssues = detectPatternViolations(lines, pathMentions, rules.prohibitedPatterns, issueCounter);
  issues.push(...patternIssues.issues);
  issueCounter = patternIssues.nextCounter;

  return {
    spec_id: spec.meta.id,
    issues,
  };
}

export async function annotateSpecAndTasks(
  params: AnnotateParams,
  options: { baseDir?: string } = {},
): Promise<AnnotateResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const specPath = path.isAbsolute(params.specPath)
    ? params.specPath
    : path.join(baseDir, params.specPath);

  await readSpecOrThrow(specPath, params.specPath);

  // Minimal no-op annotation to satisfy interface; hook for future persistence.
  void params.report;

  return { success: true };
}

export const archValidateSpec = {
  name: 'arch.validate_spec',
  handler: async (params: { spec_path: string }) =>
    wrapWithErrorHandling(() =>
      validateSpec({ specPath: params.spec_path }, { baseDir: process.cwd() }),
    ),
};

export const archAnnotateSpecAndTasks = {
  name: 'arch.annotate_spec_and_tasks',
  handler: async (params: { spec_path: string; report: unknown }) =>
    wrapWithErrorHandling(() =>
      annotateSpecAndTasks(
        { specPath: params.spec_path, report: params.report },
        { baseDir: process.cwd() },
      ),
    ),
};

function parseLayers(input: unknown): Layer[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw Errors.ruleParseError('layers must be a non-empty array');
  }

  const layers: Layer[] = [];
  const seen = new Set<string>();

  for (const entry of input) {
    if (!entry || typeof entry !== 'object') {
      throw Errors.ruleParseError('layer entries must be objects');
    }

    const layer = entry as Record<string, unknown>;
    const name = typeof layer.name === 'string' ? layer.name.trim() : '';
    const layerPath = typeof layer.path === 'string' ? layer.path.trim() : '';

    if (!name || !layerPath) {
      throw Errors.ruleParseError('layer entries require name and path');
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw Errors.ruleParseError(`duplicate layer name "${name}"`);
    }
    seen.add(key);

    layers.push({ name, path: normalizePath(layerPath) });
  }

  return layers;
}

function parseRules(input: unknown, layers: Layer[]): LayerRule[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    throw Errors.ruleParseError('rules must be an array of strings');
  }

  const layerLookup = buildLayerLookup(layers);
  const rules: LayerRule[] = [];

  for (const raw of input) {
    if (typeof raw !== 'string') {
      throw Errors.ruleParseError('rules must be strings');
    }

    const match = raw.match(/^(\w[\w-]*)\s+(may(?:\s+not)?)\s+depend\s+on\s+(\w[\w-]*)$/i);
    if (!match) {
      throw Errors.ruleParseError(`invalid rule grammar: "${raw}"`);
    }

    const [, fromRaw, constraintRaw, toRaw] = match;
    const from = normalizeLayerName(fromRaw);
    const to = normalizeLayerName(toRaw);
    const allow = !constraintRaw.toLowerCase().includes('not');

    if (!layerLookup.has(from) || !layerLookup.has(to)) {
      throw Errors.ruleParseError(`rule references unknown layer: ${raw}`);
    }

    rules.push({
      from: layerLookup.get(from)!.name,
      to: layerLookup.get(to)!.name,
      allow,
      raw,
    });
  }

  return rules;
}

function parseProhibitedPatterns(input: unknown): ProhibitedPattern[] {
  const container = (input as Record<string, unknown>)?.prohibited ?? input;
  if (container === undefined) return [];
  if (!Array.isArray(container)) {
    throw Errors.ruleParseError('patterns.prohibited must be an array');
  }

  const patterns: ProhibitedPattern[] = [];

  for (const entry of container) {
    if (!entry || typeof entry !== 'object') {
      throw Errors.ruleParseError('prohibited pattern entries must be objects');
    }

    const obj = entry as Record<string, unknown>;
    const name = typeof obj.pattern === 'string' ? obj.pattern : undefined;
    const regexText = typeof obj.regex === 'string' ? obj.regex : undefined;
    const flags = typeof obj.flags === 'string' ? obj.flags : undefined;
    const paths = Array.isArray(obj.paths)
      ? obj.paths.map((p) => String(p))
      : obj.paths === undefined
        ? ['**']
        : (() => {
            throw Errors.ruleParseError('pattern paths must be an array when provided');
          })();

    if (!name || !regexText) {
      throw Errors.ruleParseError('prohibited patterns require pattern and regex');
    }

    let compiled: RegExp;
    try {
      compiled = new RegExp(regexText, flags);
    } catch (error) {
      throw Errors.ruleParseError(`invalid regex for pattern "${name}": ${(error as Error).message}`);
    }

    patterns.push({ pattern: name, regex: compiled, paths: paths.map(normalizePath) });
  }

  return patterns;
}

function readSpecOrThrow(resolvedPath: string, originalInput: string) {
  return readSpec(resolvedPath).catch((error) => {
    if (error instanceof SpecError) {
      if (error.code === 'SPEC_NOT_FOUND') {
        throw Errors.specNotFound(originalInput);
      }

      throw new McpError(
        ErrorCode.TASK_PARSE_ERROR,
        `Failed to parse spec at ${originalInput}: ${(error as Error).message}`,
        { specPath: originalInput },
      );
    }
    throw error;
  });
}

function extractPathMentions(lines: string[]): PathMention[] {
  const mentions: PathMention[] = [];
  const pathRegex = /((?:src|app|packages|libs)[/\\][A-Za-z0-9._\-\/\\]+(?:\.[A-Za-z0-9]+)?)/g;

  lines.forEach((line, idx) => {
    let match: RegExpExecArray | null;
    while ((match = pathRegex.exec(line)) !== null) {
      mentions.push({ value: normalizePath(match[1]), line: idx + 1 });
    }
  });

  return mentions;
}

function detectDependencies(
  lines: string[],
  mentions: PathMention[],
  layerLookup: Map<string, Layer>,
): LayerDependency[] {
  const dependencies: LayerDependency[] = [];
  const mentionsByLine = groupMentionsByLine(mentions);
  const layerNames = Array.from(layerLookup.values()).map((l) => l.name);
  const layerNameRegex = buildLayerNameRegex(layerNames);
  const connectorRegex = /(->|=>|depends on|uses|calls|imports)/i;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const line = lines[i];

    const lineMentions = mentionsByLine.get(lineNumber) ?? [];
    if (lineMentions.length >= 2) {
      for (let j = 0; j < lineMentions.length - 1; j += 1) {
        const fromLayer = mapPathToLayer(lineMentions[j].value, layerLookup);
        const toLayer = mapPathToLayer(lineMentions[j + 1].value, layerLookup);
        if (fromLayer && toLayer && fromLayer.name !== toLayer.name) {
          dependencies.push({ fromLayer: fromLayer.name, toLayer: toLayer.name, evidence: line, line: lineNumber });
        }
      }
    }

    if (connectorRegex.test(line)) {
      const layersMentioned = extractLayersFromLine(line, layerNameRegex);
      if (layersMentioned.length >= 2) {
        for (let j = 0; j < layersMentioned.length - 1; j += 1) {
          const from = layersMentioned[j];
          const to = layersMentioned[j + 1];
          if (from !== to) {
            dependencies.push({ fromLayer: from, toLayer: to, evidence: line, line: lineNumber });
          }
        }
      }
    }
  }

  return dependencies;
}

function detectPatternViolations(
  lines: string[],
  mentions: PathMention[],
  patterns: ProhibitedPattern[],
  counterStart: number,
): { issues: ValidationIssue[]; nextCounter: number } {
  const issues: ValidationIssue[] = [];
  let counter = counterStart;
  const mentionsByLine = groupMentionsByLine(mentions);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;
    const pathsOnLine = (mentionsByLine.get(lineNumber) ?? []).map((m) => m.value);

    for (const pattern of patterns) {
      const targets = pattern.paths ?? ['**'];

      if (targets.length > 0) {
        if (pathsOnLine.length === 0) continue;
        const relevant = pathsOnLine.some((p) => targets.some((g) => globMatches(p, g)));
        if (!relevant) continue;
      }

      if (pattern.regex.test(line)) {
        issues.push({
          id: `ARCH-${counter++}`,
          severity: 'error',
          type: 'pattern_violation',
          description: `Pattern "${pattern.pattern}" triggered on line ${lineNumber}: ${line.trim()}`,
          suggestion: 'Rewrite to avoid the prohibited pattern or adjust the path scope.',
        });
      }
    }
  }

  return { issues, nextCounter: counter };
}

function buildLayerLookup(layers: Layer[]): Map<string, Layer> {
  const map = new Map<string, Layer>();
  for (const layer of layers) {
    map.set(layer.name.toLowerCase(), layer);
  }
  return map;
}

function buildRuleMap(rules: LayerRule[]): Map<string, LayerRule> {
  const map = new Map<string, LayerRule>();
  for (const rule of rules) {
    map.set(`${rule.from}->${rule.to}`, rule);
  }
  return map;
}

function normalizeLayerName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\//, '');
}

function mapPathToLayer(pathValue: string, layers: Map<string, Layer>): Layer | undefined {
  const normalized = normalizePath(pathValue);
  for (const layer of layers.values()) {
    const prefix = normalizePath(layer.path);
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return layer;
    }
  }
  return undefined;
}

function groupMentionsByLine(mentions: PathMention[]): Map<number, PathMention[]> {
  const map = new Map<number, PathMention[]>();
  for (const mention of mentions) {
    const list = map.get(mention.line) ?? [];
    list.push(mention);
    map.set(mention.line, list);
  }
  return map;
}

function extractLayersFromLine(line: string, regex: RegExp): string[] {
  const layers: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    layers.push(match[1]);
  }
  return layers;
}

function buildLayerNameRegex(layerNames: string[]): RegExp {
  const escaped = layerNames.map(escapeRegex).join('|');
  return new RegExp(`\\b(${escaped})\\b`, 'gi');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function globMatches(pathValue: string, glob: string): boolean {
  const normalizedGlob = normalizePath(glob);
  const escaped = normalizedGlob.split('**').map((part) => escapeRegex(part)).join('.*');
  const final = escaped.replace(/\\\*/g, '[^/]*').replace(/\\\?/g, '.');
  const regex = new RegExp(`^${final}$`);
  return regex.test(normalizePath(pathValue));
}
