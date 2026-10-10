import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';

const log = new Logger('tool.type-coverage');

const ARGUMENTS: readonly string[] = [
  '--at-least',
  '100',
  '--strict',
  '--detail',
  '--ignore-files',
  '**/*.test.ts',
  '--ignore-files',
  '**/*.test-d.ts',
];

const solutionSchema = z.object({
  references: z.array(z.object({ path: z.string().min(1) })).min(1),
});

function projects(): readonly string[] {
  const raw: unknown = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  return solutionSchema.parse(raw).references.map((reference) => reference.path);
}

function measures(project: string): boolean {
  try {
    execFileSync('pnpm', ['exec', 'type-coverage', '-p', project, ...ARGUMENTS], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (cause) {
    log.warn('type_coverage.short', { project, report: String(cause) });
    return false;
  }
}

const short = projects().filter((project) => !measures(project));

if (short.length > 0) {
  log.warn('type_coverage.refused', { count: short.length, short });
  process.exitCode = 1;
} else {
  log.info('type_coverage.complete', { projects: projects().length });
}
