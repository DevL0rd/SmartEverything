import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readRepositoryJson } from './contract-helpers';
import { repositoryFile } from './versions';

const MANIFEST = z.object({ scripts: z.record(z.string(), z.string()) });

describe('type-coverage contract', () => {
  it('is run once per project, because the solution config holds no files of its own', () => {
    const scripts = readRepositoryJson('package.json', MANIFEST).scripts;
    expect(scripts['check:types-coverage']).toBe('tsx tooling/check-type-coverage.ts');
  });

  it('demands complete type coverage, in strict mode', () => {
    const runner = readFileSync(repositoryFile('tooling/check-type-coverage.ts'), 'utf8');
    expect(runner).toContain("'--at-least',\n  '100',");
    expect(runner).toContain("'--strict',");
  });
});
