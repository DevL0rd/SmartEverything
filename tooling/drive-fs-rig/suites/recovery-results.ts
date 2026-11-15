import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO } from '../paths.ts';

export interface CaseResult {
  readonly name: string;
  readonly runs: number;
  readonly passes: number;
  readonly failure: string | null;
  readonly seconds: number;
  readonly notes: readonly string[];
}

export interface SuiteResult {
  readonly suite: string;
  readonly command: string;
  readonly startedAt: string;
  readonly cases: readonly CaseResult[];
}

export const RESULTS_DIRECTORY = join(REPO, 'tmp', 'drive-mount-fs', 'results');

export function passed(result: CaseResult): boolean {
  return result.failure === null && result.passes === result.runs;
}

export function totals(cases: readonly CaseResult[]): {
  readonly pass: number;
  readonly fail: number;
} {
  const pass = cases.filter(passed).length;
  return { pass, fail: cases.length - pass };
}

export function renderResults(result: SuiteResult): string {
  const { pass, fail } = totals(result.cases);
  const lines = [
    `# ${result.suite} · ${result.startedAt}`,
    '',
    `Command: \`${result.command}\``,
    '',
    `Cases: ${String(result.cases.length)} · pass ${String(pass)} · fail ${String(fail)} · not run 0`,
    '',
    '| case | passes in a row | seconds | verdict |',
    '| --- | --- | --- | --- |',
    ...result.cases.map(
      (item) =>
        `| ${item.name} | ${String(item.passes)} of ${String(item.runs)} | ${item.seconds.toFixed(0)} | ${passed(item) ? 'pass' : 'FAIL'} |`,
    ),
  ];
  const failures = result.cases.filter((item) => !passed(item));
  if (failures.length > 0) {
    lines.push('', '## Failures');
    for (const item of failures)
      lines.push('', `### ${item.name}`, '', '```', item.failure ?? 'incomplete', '```');
  }
  const noted = result.cases.filter((item) => item.notes.length > 0);
  if (noted.length > 0) {
    lines.push('', '## Notes');
    for (const item of noted) lines.push('', `- ${item.name}: ${item.notes.join('; ')}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function writeResults(result: SuiteResult): Promise<string> {
  await mkdir(RESULTS_DIRECTORY, { recursive: true });
  const stamp = result.startedAt.replaceAll(':', '').replace(/\.\d+Z$/u, 'Z');
  const file = join(RESULTS_DIRECTORY, `${result.suite}-${stamp}.md`);
  await writeFile(file, renderResults(result));
  return file;
}
