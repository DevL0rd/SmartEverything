import { closeSync, openSync } from 'node:fs';
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout } from 'node:process';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { execIn } from '../helper.ts';
import { isMissing } from '../errors.ts';
import { replaceComputer } from '../lifecycle.ts';
import { mountComputer } from '../mounting.ts';
import {
  REPO,
  SCRATCH,
  computerName,
  files,
  loadState,
  type ComputerName,
  type ComputerState,
} from '../paths.ts';
import { KNOWN_LIMITS, limitOf, parseCheck, parseTap, type FsxRun } from './posix-parse.ts';

const SUITES = z.enum(['pjd', 'fsx', 'xfstests']);
type Suite = z.infer<typeof SUITES>;

const GITHUB = join(homedir(), 'Github');
const PJD = join(GITHUB, 'pjdfstest');
const XFS = join(GITHUB, 'xfstests-dev');
const FSX = join(XFS, 'ltp', 'fsx');
const RESULTS = join(REPO, 'tmp', 'drive-mount-fs', 'results');
const XFS_SCRATCH = join(SCRATCH, 'xfs');
const TAIL_LINES = 60;
const FAILURE_TEXT_CHARS = 300;

const FSX_RUNS: readonly {
  readonly label: string;
  readonly args: readonly string[];
  readonly file: string;
}[] = [
  { label: 'seed 1', args: ['-N', '1000000', '-S', '1'], file: 'a1' },
  { label: 'seed 2', args: ['-N', '1000000', '-S', '2'], file: 'a2' },
  { label: 'seed 3', args: ['-N', '1000000', '-S', '3'], file: 'a3' },
  { label: 'seed 4', args: ['-N', '1000000', '-S', '4'], file: 'a4' },
  {
    label: 'large operations seed 5',
    args: ['-N', '200000', '-o', '1048576', '-l', '67108864', '-S', '5'],
    file: 'b',
  },
];

const MOUNT_WRAPPER = `#!/bin/sh
for argument in "$@"; do
  case "$argument" in
    fuse.smarteverything)
      source=
      directory=
      options=
      skip=
      for item in "$@"; do
        if [ "$skip" = t ]; then skip=; continue; fi
        if [ "$skip" = o ]; then skip=; options=\${options:+$options,}$item; continue; fi
        case "$item" in
          -t) skip=t ;;
          -o) skip=o ;;
          -*) ;;
          *) if [ -z "$source" ]; then source=$item; else directory=$item; fi ;;
        esac
      done
      exec mount.fuse.smarteverything "$source" "$directory" -o "$options"
      ;;
  esac
done
exec /usr/bin/mount "$@"
`;

const DF_WRAPPER = `#!/bin/bash
set -o pipefail
/usr/bin/df "$@" | sed 's/fuse\\.smarteverything/fuse/'
`;

const LOCAL_CONFIG = `export FSTYP=fuse
export FUSE_SUBTYP=.smarteverything
export TEST_DEV=//smarteverything/test
export TEST_DIR=${XFS_SCRATCH}/test
export SCRATCH_DEV=//smarteverything/scratch
export SCRATCH_MNT=${XFS_SCRATCH}/scratch
export RESULT_BASE=${XFS_SCRATCH}/results
`;

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function resultPath(suite: string): Promise<string> {
  await mkdir(RESULTS, { recursive: true });
  const taken = new Set(await readdir(RESULTS));
  const base = `${suite}-${stamp()}`;
  let name = `${base}.md`;
  for (let counter = 2; taken.has(name); counter += 1) name = `${base}-${String(counter)}.md`;
  return join(RESULTS, name);
}

function tail(text: string, lines = TAIL_LINES): string {
  return text.trimEnd().split('\n').slice(-lines).join('\n');
}

async function readIfPresent(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return '';
    throw cause;
  }
}

async function mounted(name: ComputerName): Promise<ComputerState> {
  const state = await loadState();
  const computer = state.computers[name];
  if (computer.mount !== null && computer.helperPid !== null && computer.mount.folder === null)
    return computer;
  if (computer.helperPid !== null)
    throw new Error(
      `${name} has a helper with a different mount; run "rig unmount ${name}" first.`,
    );
  const started = await mountComputer(state, name, {
    placement: 'test',
    folder: null,
    route: 'lan',
  });
  await replaceComputer(state, name, started);
  return started;
}

async function runLogged(
  computer: ComputerState,
  command: readonly string[],
  log: string,
): Promise<number> {
  await mkdir(join(log, '..'), { recursive: true });
  const descriptor = openSync(log, 'a');
  try {
    return await execIn(computer, command, ['ignore', descriptor, descriptor]);
  } finally {
    closeSync(descriptor);
  }
}

function pointOf(computer: ComputerState): string {
  if (computer.mount === null) throw new Error('The computer has no mount.');
  return computer.mount.point;
}

function header(suite: string, command: string, started: Date): string[] {
  return [
    `# ${suite} on the Drive mount`,
    '',
    `- Date: ${started.toISOString()}`,
    `- Command: \`${command}\``,
  ];
}

async function pjd(only: readonly string[], name: ComputerName): Promise<boolean> {
  const computer = await mounted(name);
  const targets =
    only.length === 0 ? [join(PJD, 'tests')] : only.map((test) => join(PJD, 'tests', test));
  const log = join(SCRATCH, 'logs', `pjd-${String(Date.now())}.log`);
  const started = new Date();
  const command = `cd ${pointOf(computer)}/pjd && prove -rv ${targets.join(' ')}`;
  const code = await runLogged(
    computer,
    [
      'sh',
      '-c',
      'mkdir -p "$1/pjd" && cd "$1/pjd" && shift && PJD_NO_DEVICE_NODES=1 exec prove -rv "$@"',
      'sh',
      pointOf(computer),
      ...targets,
    ],
    log,
  );
  const text = await readFile(log, 'utf8');
  const summary = parseTap(text);
  const unexplained = summary.failures.filter((failure) => limitOf(failure.file) === undefined);
  const clean = summary.result !== 'UNKNOWN' && unexplained.length === 0;
  const lines = header('pjdfstest', command, started);
  lines.push(
    `- Exit code: ${String(code)}`,
    `- Prove result: ${summary.result}`,
    `- Passed: ${String(summary.passed)}`,
    `- Failed: ${String(summary.failed)}`,
    `- Failed outside the known limits: ${String(unexplained.length)}`,
    `- Not run (skipped by the suite): ${String(summary.notRun)}`,
    '',
    '## Known limits',
    '',
  );
  for (const limit of KNOWN_LIMITS) {
    const count = summary.failures.filter((failure) => limitOf(failure.file) === limit).length;
    lines.push(`- ${limit.name} (${String(count)} failures): ${limit.reason}`);
  }
  lines.push('', '## Failures outside the known limits', '');
  if (unexplained.length === 0) lines.push('None.');
  for (const failure of unexplained)
    lines.push(`- ${failure.file}: ${failure.test.slice(0, FAILURE_TEXT_CHARS)}`);
  lines.push('', '## Output tail', '', '```', tail(text), '```');
  await writeFile(await resultPath('pjdfstest'), `${lines.join('\n')}\n`);
  return clean;
}

async function fsx(only: readonly string[], name: ComputerName): Promise<boolean> {
  const computer = await mounted(name);
  const point = pointOf(computer);
  const chosen = only.length === 0 ? FSX_RUNS : FSX_RUNS.filter((run) => only.includes(run.file));
  const started = new Date();
  const runs: FsxRun[] = [];
  for (const run of chosen) {
    const log = join(SCRATCH, 'logs', `fsx-${run.file}.log`);
    const code = await runLogged(
      computer,
      [
        'sh',
        '-c',
        'mkdir -p "$1/fsx" && shift && exec "$@"',
        'sh',
        point,
        FSX,
        ...run.args,
        join(point, 'fsx', run.file),
      ],
      log,
    );
    runs.push({ label: run.label, exitCode: code, tail: tail(await readIfPresent(log), 30) });
  }
  const lines = header('fsx', `${FSX} <args> ${point}/fsx/<file>`, started);
  lines.push('');
  for (const run of runs)
    lines.push(
      `- ${run.label}: ${run.exitCode === 0 ? 'completed' : `FAILED with exit code ${String(run.exitCode)}`}`,
    );
  for (const run of runs)
    if (run.exitCode !== 0) lines.push('', `## ${run.label}`, '', '```', run.tail, '```');
  await writeFile(await resultPath('fsx'), `${lines.join('\n')}\n`);
  return runs.every((run) => run.exitCode === 0);
}

async function listIfPresent(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (cause) {
    if (isMissing(cause) || (cause instanceof Error && 'code' in cause && cause.code === 'ENOTDIR'))
      return [];
    throw cause;
  }
}

async function collectNotRun(): Promise<string[]> {
  const found: string[] = [];
  const groups = await listIfPresent(join(XFS_SCRATCH, 'results'));
  for (const group of groups) {
    const entries = await listIfPresent(join(XFS_SCRATCH, 'results', group));
    for (const entry of entries.filter((name) => name.endsWith('.notrun'))) {
      const reason = (await readIfPresent(join(XFS_SCRATCH, 'results', group, entry))).trim();
      found.push(`${group}/${entry.replace(/\.notrun$/u, '')}: ${reason}`);
    }
  }
  return found;
}

async function failureOutput(name: string): Promise<string> {
  const bad = await readIfPresent(join(XFS_SCRATCH, 'results', `${name}.out.bad`));
  const full = bad === '' ? await readIfPresent(join(XFS_SCRATCH, 'results', `${name}.full`)) : bad;
  return tail(full, 40);
}

async function prepareXfstests(): Promise<void> {
  await mkdir(files.bin, { recursive: true });
  const wrapper = join(files.bin, 'mount');
  await writeFile(wrapper, MOUNT_WRAPPER);
  await chmod(wrapper, 0o755);
  const df = join(files.bin, 'df');
  await writeFile(df, DF_WRAPPER);
  await chmod(df, 0o755);
  await mkdir(join(XFS_SCRATCH, 'tmp'), { recursive: true });
  await writeFile(join(XFS, 'local.config'), LOCAL_CONFIG);
}

async function genericTests(): Promise<string[]> {
  const entries = await readdir(join(XFS, 'tests', 'generic'));
  return entries
    .filter((entry) => /^\d+$/u.test(entry))
    .sort()
    .map((entry) => `generic/${entry}`);
}

async function xfstests(only: readonly string[], name: ComputerName): Promise<boolean> {
  const computer = await mounted(name);
  await prepareXfstests();
  const targets = only.length === 0 ? await genericTests() : [...only];
  const log = join(SCRATCH, 'logs', `xfstests-${String(Date.now())}.log`);
  const started = new Date();
  const script =
    'mkdir -p "$1/test" "$1/scratch" "$1/results" && mount --bind "$1/tmp" /tmp && cd "$2" && exec nice -n 19 ./check "${@:3}"';
  const code = await runLogged(
    computer,
    [
      'unshare',
      '--mount',
      '--propagation',
      'private',
      'bash',
      '-c',
      script,
      'bash',
      XFS_SCRATCH,
      XFS,
      ...targets,
    ],
    log,
  );
  const text = await readFile(log, 'utf8');
  const summary = parseCheck(text);
  if (summary.ran.length === 0 && summary.notRun.length === 0 && summary.failures.length === 0)
    throw new Error(`xfstests did not run any test:\n${tail(text, 20)}`);
  const command = `./check ${only.length === 0 ? 'generic/*' : targets.join(' ')}`;
  await writeFile(
    await resultPath('xfstests-generic'),
    await xfstestsReport({ command, started, code, text, summary }),
  );
  return code === 0 && summary.failures.length === 0;
}

interface XfstestsRun {
  readonly command: string;
  readonly started: Date;
  readonly code: number;
  readonly text: string;
  readonly summary: ReturnType<typeof parseCheck>;
}

async function xfstestsReport(run: XfstestsRun): Promise<string> {
  const { summary } = run;
  const lines = header('xfstests generic', run.command, run.started);
  lines.push(
    `- Exit code: ${String(run.code)}`,
    `- Ran: ${String(summary.ran.length)}`,
    `- Not run: ${String(summary.notRun.length)}`,
    `- Failures: ${String(summary.failures.length)}`,
    '',
    '## Failures',
    '',
  );
  if (summary.failures.length === 0) lines.push('None.');
  for (const name of summary.failures)
    lines.push(`### ${name}`, '', '```', await failureOutput(name), '```', '');
  const notRunReasons = await collectNotRun();
  lines.push('## Not run and the reasons', '');
  if (notRunReasons.length === 0) lines.push('None.');
  for (const reason of notRunReasons) lines.push(`- ${reason}`);
  lines.push('', '## Output tail', '', '```', tail(run.text), '```');
  return `${lines.join('\n')}\n`;
}

const RUNNERS: Readonly<
  Record<Suite, (only: readonly string[], name: ComputerName) => Promise<boolean>>
> = {
  pjd,
  fsx,
  xfstests,
};

export async function posix(args: readonly string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: { only: { type: 'string', multiple: true }, computer: { type: 'string' } },
  });
  const suite = SUITES.parse(positionals[0]);
  const clean = await RUNNERS[suite](values.only ?? [], computerName(values.computer ?? 'A'));
  stdout.write(
    `${suite}: ${clean ? 'clean' : 'failures recorded under tmp/drive-mount-fs/results'}\n`,
  );
  return clean ? 0 : 1;
}
