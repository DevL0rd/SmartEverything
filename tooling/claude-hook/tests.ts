import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { HookError, parseJson } from './input.ts';
import { skippedNotice, warnUser, type Section } from './output.ts';
import { nonEmptyLines, ROOT, runTool, TESTS_MS, VITEST_WORKERS } from './process.ts';
import { agentFile } from './state.ts';
import { isSource } from './types.ts';

const vitestReport = z.object({
  testResults: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      message: z.string().optional(),
      assertionResults: z.array(
        z.object({
          fullName: z.string(),
          status: z.string(),
          failureMessages: z.array(z.string()).optional(),
        }),
      ),
    }),
  ),
});

function firstLine(text: string | undefined): string {
  return nonEmptyLines(text ?? '')[0]?.trim() ?? 'no message';
}

export function failuresOf(report: z.infer<typeof vitestReport>): string[] {
  return report.testResults.flatMap((file) => {
    const rel = relative(ROOT, file.name);
    const failed = file.assertionResults
      .filter((test) => test.status === 'failed')
      .map((test) => `${rel} > ${test.fullName}: ${firstLine(test.failureMessages?.[0])}`);
    if (failed.length > 0 || file.status !== 'failed') return failed;
    return [`${rel} > (file failed to run): ${firstLine(file.message)}`];
  });
}

async function readReport(path: string, stderr: string): Promise<string[]> {
  if (!existsSync(path)) {
    const reason = nonEmptyLines(stderr).slice(0, 3).join(' | ');
    throw new HookError('TestOutputError', `vitest wrote no report: ${reason}`);
  }
  const parsed = parseJson(await readFile(path, 'utf8'));
  const valid = parsed.ok ? vitestReport.safeParse(parsed.value) : null;
  if (valid?.success !== true) {
    throw new HookError('TestOutputError', `${path} is not a vitest JSON report`);
  }
  return failuresOf(valid.data);
}

export async function relatedTests(
  session: string,
  agent: string,
  files: readonly string[],
): Promise<Section | null> {
  const targets = files.filter((file) => isSource(file) && existsSync(join(ROOT, file)));
  if (targets.length === 0) return null;
  const report = agentFile(session, agent, 'tests.json');
  const flags = [
    '--reporter=json',
    `--outputFile=${report}`,
    `--maxWorkers=${String(VITEST_WORKERS)}`,
  ];
  try {
    const result = await runTool(
      'vitest',
      ['related', '--run', '--passWithNoTests', ...flags, ...targets],
      TESTS_MS,
    );
    if (skippedNotice('tests', result)) return null;
    if (result.timedOut) {
      const seconds = String(TESTS_MS / 1000);
      warnUser(
        `tests timed out after ${seconds} s (${String(targets.length)} edited file(s)), so nothing was checked`,
      );
      return null;
    }
    const failures = await readReport(report, result.stderr);
    if (failures.length === 0) return null;
    const reproduce = `reproduce: pnpm exec vitest related --run ${targets.join(' ')}`;
    return { check: 'tests related to the files you edited', lines: [reproduce, ...failures] };
  } finally {
    await rm(report, { force: true });
  }
}
