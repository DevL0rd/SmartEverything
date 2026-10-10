import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { z } from 'zod';
import { HookError, parseJson } from './input.ts';
import { warnUser, type Section } from './output.ts';
import { nonEmptyLines, ROOT, runVitest, TESTS_LOCK_WAIT_MS, TESTS_MS } from './process.ts';
import { agentFile, readOriginals, writeAtomic } from './state.ts';

const TEST_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const BASELINE_CONFIG = 'tooling/claude-hook/baseline.vitest.config.ts';
const NO_ORIGINAL = null;
const MESSAGE_CHARS = 160;

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

interface Failure {
  readonly file: string;
  readonly name: string;
  readonly message: string;
}

type Ran =
  | { readonly kind: 'done'; readonly failures: readonly Failure[] }
  | { readonly kind: 'timed-out' }
  | { readonly kind: 'lock-busy' };

export interface TestOutcome {
  readonly sections: readonly Section[];
  readonly notes: readonly string[];
}

const NOTHING: TestOutcome = { sections: [], notes: [] };

function keyOf(failure: Failure): string {
  return `${failure.file} > ${failure.name}`;
}

function firstLine(text: string | undefined): string {
  const line = nonEmptyLines(text ?? '')[0]?.trim() ?? 'no message';
  return line.length > MESSAGE_CHARS ? `${line.slice(0, MESSAGE_CHARS)}...` : line;
}

function failuresOf(report: z.infer<typeof vitestReport>): Failure[] {
  return report.testResults.flatMap((file) => {
    const rel = relative(ROOT, file.name);
    const failed = file.assertionResults
      .filter((test) => test.status === 'failed')
      .map((test) => ({
        file: rel,
        name: test.fullName,
        message: firstLine(test.failureMessages?.[0]),
      }));
    if (failed.length > 0 || file.status !== 'failed') return failed;
    return [{ file: rel, name: '(file failed to run)', message: firstLine(file.message) }];
  });
}

async function readReport(path: string, stderr: string): Promise<Failure[]> {
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

async function runReport(
  report: string,
  args: readonly string[],
  env: readonly string[],
): Promise<Ran> {
  const flags = ['--reporter=json', `--outputFile=${report}`];
  const result = await runVitest([...args, ...flags], env);
  if (result.outcome !== 'finished') return { kind: result.outcome };
  return { kind: 'done', failures: await readReport(report, result.stderr) };
}

async function baselineKeys(
  session: string,
  agent: string,
  failing: readonly string[],
  originals: Readonly<Record<string, string | null>>,
): Promise<ReadonlySet<string> | 'timed-out' | 'lock-busy'> {
  const originalsPath = agentFile(session, agent, 'tests-originals.json');
  const report = agentFile(session, agent, 'tests-baseline.json');
  await writeAtomic(originalsPath, JSON.stringify(originals));
  try {
    const args = ['run', '--config', BASELINE_CONFIG, ...failing];
    const ran = await runReport(report, args, [`CLAUDE_HOOK_ORIGINALS=${originalsPath}`]);
    return ran.kind === 'done' ? new Set(ran.failures.map(keyOf)) : ran.kind;
  } finally {
    await rm(originalsPath, { force: true });
    await rm(report, { force: true });
  }
}

function section(fresh: readonly Failure[], ignored: number): Section {
  const files = [...new Set(fresh.map((failure) => failure.file))];
  const counts = `${String(fresh.length)} new failing test(s), ${String(ignored)} pre-existing failure(s) ignored`;
  return {
    check: 'tests (new since your first edit, related to the files you edited)',
    lines: [
      counts,
      `reproduce: pnpm exec vitest run ${files.join(' ')}`,
      ...fresh.map((failure) => `${keyOf(failure)}: ${failure.message}`),
    ],
  };
}

function notice(why: 'timed-out' | 'lock-busy', count: number, what: string): TestOutcome {
  const seconds = why === 'timed-out' ? TESTS_MS : TESTS_LOCK_WAIT_MS;
  const reason = why === 'timed-out' ? 'tests timed out' : 'tests skipped, the test lock was busy';
  const line = `${reason} after ${String(seconds / 1000)} s (${what} for ${String(count)} edited file(s)), so nothing was checked`;
  warnUser(line);
  return { sections: [], notes: [line] };
}

async function classify(
  session: string,
  agent: string,
  current: readonly Failure[],
  originals: Readonly<Record<string, string | null>>,
): Promise<TestOutcome> {
  const created = new Set(
    Object.entries(originals).flatMap(([rel, content]) => (content === NO_ORIGINAL ? [rel] : [])),
  );
  const known = current.filter((failure) => !created.has(failure.file));
  const failing = [...new Set(known.map((failure) => failure.file))];
  const baseline =
    failing.length === 0
      ? new Set<string>()
      : await baselineKeys(session, agent, failing, originals);
  if (typeof baseline === 'string')
    return notice(baseline, failing.length, 'baseline of failing tests');
  const fresh = current.filter((failure) => !baseline.has(keyOf(failure)));
  const ignored = current.length - fresh.length;
  if (fresh.length > 0) return { sections: [section(fresh, ignored)], notes: [] };
  if (ignored > 0) warnUser(`${String(ignored)} pre-existing test failure(s) ignored`);
  return NOTHING;
}

export async function relatedTests(
  session: string,
  agent: string,
  files: readonly string[],
): Promise<TestOutcome> {
  const targets = files.filter(
    (file) => TEST_EXT.has(extname(file)) && existsSync(join(ROOT, file)),
  );
  if (targets.length === 0) return NOTHING;
  const report = agentFile(session, agent, 'tests.json');
  const originals = await readOriginals(session, agent);
  try {
    const ran = await runReport(report, ['related', '--run', '--passWithNoTests', ...targets], []);
    if (ran.kind !== 'done') return notice(ran.kind, targets.length, 'related tests');
    if (ran.failures.length === 0) return NOTHING;
    return await classify(session, agent, ran.failures, originals);
  } finally {
    await rm(report, { force: true });
  }
}
