import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  loadArchitectureRules,
  validateSpec,
  archValidateSpec,
  ArchitectureRules,
} from '../src/arch/rules-store.js';
import { ErrorCode } from '../src/shared/errors.js';
import { writeSpec } from '../src/specs/spec-store.js';

async function writeRules(baseDir: string, yaml: string): Promise<string> {
  const dir = path.join(baseDir, 'architecture');
  await fs.mkdir(dir, { recursive: true });
  const rulesPath = path.join(dir, 'rules.yaml');
  await fs.writeFile(rulesPath, yaml, 'utf8');
  return rulesPath;
}

async function writeSpecFile(baseDir: string, content: string, name = 'specs/feature-x.md'): Promise<string> {
  const specPath = path.join(baseDir, name);
  const dir = path.dirname(specPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(specPath, content, 'utf8');
  return specPath;
}

describe('arch/rules-store', () => {
  it('parses a valid rules.yaml', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arch-rules-'));
    await writeRules(
      tmp,
      `layers:
  - name: ui
    path: src/ui
  - name: domain
    path: src/domain
rules:
  - "ui may depend on domain"
patterns:
  prohibited:
    - pattern: "no fetch"
      regex: 'fetch\\('
      paths: ["src/ui/**"]
`,
    );

    const loaded = await loadArchitectureRules(tmp);
    expect(loaded.layers).toHaveLength(2);
    expect(loaded.rules[0]?.allow).toBe(true);
    expect(loaded.prohibitedPatterns[0]?.regex).toBeInstanceOf(RegExp);
  });

  it('throws RULE_PARSE_ERROR on invalid grammar', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arch-rules-'));
    await writeRules(
      tmp,
      `layers:
  - name: a
    path: src/a
rules:
  - "a depends b"
`,
    );

    await expect(loadArchitectureRules(tmp)).rejects.toHaveProperty('code', ErrorCode.RULE_PARSE_ERROR);
  });

  it('detects layering and pattern violations', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arch-rules-'));
    await writeRules(
      tmp,
      `layers:
  - name: ui
    path: src/ui
  - name: domain
    path: src/domain
rules:
  - "ui may not depend on domain"
patterns:
  prohibited:
    - pattern: "no fetch"
      regex: 'fetch\\('
      paths: ["src/ui/**"]
`,
    );

    const specPath = await writeSpecFile(
      tmp,
      `---
id: feature-1
schema_version: "3.0"
---

# Feature

## Description
src/ui/view.ts calls src/domain/service.ts using fetch()
`,
    );

    const rules = await loadArchitectureRules(tmp);
    const result = await validateSpec({ specPath }, { baseDir: tmp, rules });

    const types = result.issues.map((i) => i.type);
    expect(types).toContain('layering_violation');
    expect(types).toContain('pattern_violation');
  });

  it('returns SPEC_NOT_FOUND via tool handler', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arch-rules-'));
    await writeRules(
      tmp,
      `layers:
  - name: ui
    path: src/ui
`,
    );

    const res = await archValidateSpec.handler({ spec_path: path.join(tmp, 'missing.md') });
    if ('error' in res) {
      expect(res.error.code).toBe(ErrorCode.SPEC_NOT_FOUND);
    } else {
      throw new Error('Expected error');
    }
  });
});
