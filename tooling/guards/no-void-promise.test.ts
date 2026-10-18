import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint, type Rule } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { filesUnder, repositoryRoot } from './repository-files';

const root = join(import.meta.dirname, '..', '..');
const plugin = z.object({
  default: z.object({ rules: z.record(z.string(), z.custom<Rule.RuleModule>()) }),
});

let eslint: ESLint;

beforeAll(async () => {
  const loaded = plugin.parse(
    await import(pathToFileURL(join(root, 'tooling/eslint/rules.js')).href),
  );
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            projectService: { allowDefaultProject: ['sample.ts'] },
            tsconfigRootDir: root,
          },
        },
        plugins: { local: loaded.default },
        rules: { 'local/no-void-promise': 'error' },
      },
    ],
  });
});

async function flagged(source: string): Promise<number> {
  const [result] = await eslint.lintText(source, { filePath: 'sample.ts' });
  return (result?.messages ?? []).filter((message) => message.ruleId === 'local/no-void-promise')
    .length;
}

describe('no-void-promise', () => {
  it('flags void on a promise', async () => {
    expect(await flagged('declare function run(): Promise<number>;\nvoid run();')).toBe(1);
    expect(await flagged('const work = Promise.resolve(1);\nvoid work;')).toBe(1);
    expect(await flagged('const f = () => void Promise.resolve(1);\nf();')).toBe(1);
  });

  it('allows void on non-promises and on a promise with a rejection handler', async () => {
    expect(await flagged('declare function run(): number;\nvoid run();')).toBe(0);
    expect(await flagged('const unused = 1;\nvoid unused;')).toBe(0);
    expect(
      await flagged('void Promise.resolve(1).catch((error: unknown) => {\n  throw error;\n});'),
    ).toBe(0);
  });
});

const DIRECTIVE = /eslint-disable(?:-next-line)? local\/no-void-promise[^\n]*/g;
const BUDGET = 5;

function sources(): readonly string[] {
  return ['apps', 'packages', 'tooling']
    .flatMap((top) => filesUnder(`${repositoryRoot}/${top}`))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !/node_modules|\/dist|\/coverage|\.test\./.test(file));
}

describe('void promises stay rare', () => {
  it('keeps the allowed exceptions within the budget and each with a reason', () => {
    const directives = sources().flatMap((file) =>
      (readFileSync(file, 'utf8').match(DIRECTIVE) ?? []).map((directive) => ({
        file: relative(repositoryRoot, file),
        directive,
      })),
    );
    expect(directives.length).toBeLessThanOrEqual(BUDGET);
    expect(directives.filter(({ directive }) => !/-- \S/.test(directive))).toEqual([]);
  });
});
