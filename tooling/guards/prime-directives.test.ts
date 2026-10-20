import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

const root = join(import.meta.dirname, '..', '..');

function readJson<T>(file: string, schema: z.ZodType<T>): T {
  const raw: unknown = JSON.parse(readFileSync(join(root, file), 'utf8'));
  return schema.parse(raw);
}

const manifest = z.object({ scripts: z.record(z.string(), z.string()) });
const stryker = z.object({
  thresholds: z.object({ high: z.number(), low: z.number(), break: z.number() }),
  mutate: z.array(z.string()),
});
const projectConfig = z.looseObject({
  test: z.looseObject({
    projects: z.array(z.looseObject({ test: z.looseObject({ name: z.string() }) })),
    coverage: z.looseObject({ include: z.array(z.string()).default([]) }).default({ include: [] }),
  }),
});
const duplication = z.object({ threshold: z.number(), minLines: z.number() });
const compiler = z.object({ compilerOptions: z.record(z.string(), z.unknown()) });
const resolved = z.object({ rules: z.record(z.string(), z.unknown()).default({}) });

const MEASURED_PACKAGES = ['logging', 'domain', 'xiaomi', 'ble', 'ipp', 'tuya', 'smartthings', 'shelly'];

const UNMEASURED_PACKAGES: Readonly<Record<string, string>> = {
  harness:
    'hosts the vendored agent runtime and is checked by behaviour tests, not held to the shared-package 100% rule',
};

async function projectsOf(file: string): Promise<readonly string[]> {
  const loaded: unknown = await import(pathToFileURL(join(root, file)).href);
  const parsed = z.object({ default: projectConfig }).parse(loaded).default;
  return parsed.test.projects.map((project) => project.test.name);
}

async function coverageIncludeOf(file: string): Promise<readonly string[]> {
  const loaded: unknown = await import(pathToFileURL(join(root, file)).href);
  return z.object({ default: projectConfig }).parse(loaded).default.test.coverage.include;
}

function packagesWithSource(): readonly string[] {
  return readdirSync(join(root, 'packages')).filter((name) =>
    existsSync(join(root, 'packages', name, 'src')),
  );
}

function coverageProjects(): readonly string[] {
  const script = readJson('package.json', manifest).scripts['test:coverage'] ?? '';
  return [...script.matchAll(/--project (\S+)/g)].map((match) => match[1] ?? '');
}

let rules: Record<string, unknown> = {};

beforeAll(async () => {
  const raw: unknown = await new ESLint({ cwd: root }).calculateConfigForFile(
    join(root, 'packages/logging/src/index.ts'),
  );
  rules = resolved.parse(raw).rules;
});

function isEnforced(rule: string): boolean {
  const entry = rules[rule];
  const severity: unknown = Array.isArray(entry) ? entry[0] : entry;
  return severity === 'error' || severity === 2;
}

describe('directive 2 — 100% coverage, no exceptions', () => {
  it('holds every coverage metric at 100', () => {
    const config = readFileSync(join(root, 'vitest.config.ts'), 'utf8');

    for (const metric of ['branches', 'functions', 'lines', 'statements']) {
      expect(config).toMatch(new RegExp(`${metric}:\\s*100\\s*,`));
    }
  });
});

describe('directive 3 — 100% mutation score', () => {
  const config = readJson('stryker.config.json', stryker);

  it('breaks the build below 100', () => {
    expect(config.thresholds.break).toBe(100);
    expect(config.thresholds.low).toBe(100);
    expect(config.thresholds.high).toBe(100);
  });

  it('mutates every measured package', () => {
    for (const workspace of MEASURED_PACKAGES) {
      expect(config.mutate).toContain(`packages/${workspace}/src/**/*.ts`);
    }
  });

  it('mutates only measured packages', () => {
    const named = config.mutate
      .filter((pattern) => pattern.startsWith('packages/') && !pattern.startsWith('!'))
      .map((pattern) => pattern.split('/')[1]);
    expect([...named].sort()).toStrictEqual([...MEASURED_PACKAGES].sort());
  });
});

describe('directive 2 and 3 — every package is measured or says why not', () => {
  it('lists every package with source as measured or unmeasured with a reason', () => {
    const known = [...MEASURED_PACKAGES, ...Object.keys(UNMEASURED_PACKAGES)].sort();
    expect([...packagesWithSource()].sort()).toStrictEqual(known);
  });

  it('runs the coverage gate on every measured package and on no other', () => {
    expect([...coverageProjects()].sort()).toStrictEqual([...MEASURED_PACKAGES].sort());
  });

  it('collects coverage from every measured package and from no other', async () => {
    const include = await coverageIncludeOf('vitest.config.ts');
    expect(include).toStrictEqual([`packages/{${MEASURED_PACKAGES.join(',')}}/src/**/*.ts`]);
  });

  it('runs the mutation gate on a test project of every measured package', async () => {
    const projects = await projectsOf('vitest.mutation.config.ts');
    expect([...projects].sort()).toStrictEqual([...MEASURED_PACKAGES].sort());
  });

  it('defines the test project each measured package is run by', async () => {
    const projects = await projectsOf('vitest.config.ts');
    for (const name of [...MEASURED_PACKAGES, ...Object.keys(UNMEASURED_PACKAGES)]) {
      expect(projects).toContain(name);
    }
  });

  it('gives every unmeasured package a reason', () => {
    for (const reason of Object.values(UNMEASURED_PACKAGES)) {
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});

describe('directive 4 — zero lint errors and zero warnings', () => {
  it('fails the lint run on a single warning', () => {
    expect(readJson('package.json', manifest).scripts['lint']).toContain('--max-warnings=0');
  });

  it('gives the type-aware CI lint run enough heap to finish', () => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain(
      '- run: pnpm run lint\n        env:\n          NODE_OPTIONS: --max-old-space-size=4096',
    );
  });

  it('loads Expo ambient types without generated local files', () => {
    const options = readJson('apps/app/tsconfig.json', compiler).compilerOptions;

    expect(options['types']).toEqual(expect.arrayContaining(['expo/types']));
  });
});

describe('directive 5 — no any, no assertions, no non-null assertions', () => {
  it('forbids an explicit any', () => {
    expect(isEnforced('@typescript-eslint/no-explicit-any')).toBe(true);
  });

  it('forbids a non-null assertion', () => {
    expect(isEnforced('@typescript-eslint/no-non-null-assertion')).toBe(true);
  });

  it('forbids a type assertion that is not as const', () => {
    const restricted = rules['no-restricted-syntax'];
    expect(JSON.stringify(restricted)).toContain('TSAsExpression');
  });

  it('keeps every strictness flag the compiler offers', () => {
    const options = readJson('tsconfig.base.json', compiler).compilerOptions;

    for (const flag of [
      'strict',
      'noUncheckedIndexedAccess',
      'exactOptionalPropertyTypes',
      'noImplicitOverride',
      'noPropertyAccessFromIndexSignature',
      'useUnknownInCatchVariables',
      'noImplicitReturns',
      'noFallthroughCasesInSwitch',
      'allowUnreachableCode',
      'allowUnusedLabels',
    ]) {
      expect(options).toHaveProperty(flag);
    }

    expect(options['strict']).toBe(true);
    expect(options['noUncheckedIndexedAccess']).toBe(true);
    expect(options['exactOptionalPropertyTypes']).toBe(true);
    expect(options['allowUnreachableCode']).toBe(false);
    expect(options['allowUnusedLabels']).toBe(false);
  });
});

describe('directive 6 — zero duplicated logic', () => {
  it('allows no clone at all', () => {
    expect(readJson('.jscpd.json', duplication).threshold).toBe(0);
  });
});

describe('directive 7 — no silent fallbacks', () => {
  it('forbids an empty block, a catch included', () => {
    const entry = rules['no-empty'];
    expect(isEnforced('no-empty')).toBe(true);
    expect(JSON.stringify(entry)).toContain('"allowEmptyCatch":false');
  });

  it('forbids a catch that does not bind the error', () => {
    expect(JSON.stringify(rules['no-restricted-syntax'])).toContain('CatchClause[param=null]');
  });
});

describe('directive 8 — no code comments', () => {
  it('is enforced by the linter, not by review', () => {
    expect(isEnforced('local/no-comments')).toBe(true);
  });
});

describe('directive 12 — every log line goes through the logger', () => {
  it('forbids reaching the console directly', () => {
    expect(isEnforced('no-console')).toBe(true);
  });
});

describe('the enforced limits', () => {
  const limit = z.union([z.number(), z.object({ max: z.number() }).loose()]);

  function limitOf(rule: string): number {
    const entry = z.tuple([z.unknown(), limit]).parse(rules[rule]);
    const held = entry[1];
    return typeof held === 'number' ? held : held.max;
  }

  it('caps cyclomatic complexity at 10', () => {
    expect(isEnforced('complexity')).toBe(true);
    expect(limitOf('complexity')).toBe(10);
  });

  it('caps a file at 400 lines', () => {
    expect(isEnforced('max-lines')).toBe(true);
    expect(limitOf('max-lines')).toBe(400);
  });

  it('caps a function at 50 lines', () => {
    expect(isEnforced('max-lines-per-function')).toBe(true);
    expect(limitOf('max-lines-per-function')).toBe(50);
  });

  it('caps nesting at a depth of 4', () => {
    expect(isEnforced('max-depth')).toBe(true);
    expect(limitOf('max-depth')).toBe(4);
  });

  it('caps a function at 4 parameters', () => {
    expect(isEnforced('max-params')).toBe(true);
    expect(limitOf('max-params')).toBe(4);
  });
});

describe('the gates themselves', () => {
  it('ships mobile releases only as store binaries', () => {
    const config = readFileSync(join(root, 'apps/app/app.config.ts'), 'utf8');
    const packageJson = readFileSync(join(root, 'apps/app/package.json'), 'utf8');

    expect(config).toContain('updates: { enabled: false }');
    expect(packageJson).not.toContain('expo-updates');
  });

  it('runs every directive gate in one local command', () => {
    const validate = readJson('package.json', manifest).scripts['validate'] ?? '';

    for (const gate of [
      'lint',
      'typecheck',
      'test:coverage',
      'test:mutation',
      'check:duplication',
      'check:types-coverage',
    ]) {
      expect(validate).toContain(`pnpm run ${gate}`);
    }
  });
});
