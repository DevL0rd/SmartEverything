import { appendFile, mkdir, readdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { isMissing } from '../errors.ts';
import { REPO, TMP } from '../paths.ts';
import { run } from '../processes.ts';
import { ensureFixtures, type Fixtures } from './fixtures.ts';
import { buildHelper, seTarget } from './helper.ts';
import { nfsServerErrors, nfsTarget, startNfsServer, stopNfsServer } from './nfs.ts';
import { BENCH, BENCH_DIR, BENCH_FOLDER, RESULTS, bench } from './paths.ts';
import {
  allWorkloads,
  bestMaxBackground,
  datasetsFor,
  phasesFor,
  schedule,
  type Phases,
  SWEEP_RUNS,
  SWEEP_VALUES,
  SWEEP_WORKLOADS,
} from './plan.ts';
import { shapeOf, summary } from './summary.ts';
import { isMounted } from './mounts.ts';
import { pairBenchComputer, revokeBenchComputer, type Production } from './production.ts';
import type { Target } from './target.ts';

const RESULT = z.looseObject({
  workload: z.string(),
  seconds: z.number(),
  kind: z.string().optional(),
});

const SMALL_FLAGS = [
  '-seq-mib',
  '64',
  '-rand-mib',
  '16',
  '-rand-ops',
  '2048',
  '-files',
  '400',
  '-office-mib',
  '2',
  '-saves',
  '3',
];

export interface Config {
  readonly kinds: readonly string[];
  readonly runs: number;
  readonly workloads: readonly string[] | null;
  readonly sweep: boolean;
  readonly small: boolean;
  readonly helper: string | null;
  readonly stamp: string;
}

interface Drive {
  readonly production: Production;
  readonly binary: string;
}

interface Context {
  readonly config: Config;
  readonly fixtures: Fixtures | null;
  readonly resultsFile: string;
}

function goArgs(context: Context, target: Target): string[] {
  const sizes = context.config.small ? SMALL_FLAGS : [];
  const sources =
    context.fixtures === null
      ? []
      : ['-tarball', context.fixtures.tarball, '-mirror', context.fixtures.mirror];
  return [...sizes, ...sources, ...target.drain()];
}

export async function bencher(target: Target, args: readonly string[]): Promise<string> {
  const wrapped = target.wrap(bench.binary, args);
  const { stdout } = await run(wrapped.command, [...wrapped.args]);
  return stdout;
}

export async function buildBench(): Promise<void> {
  await mkdir(bench.bin, { recursive: true });
  await run('go', ['build', '-trimpath', '-o', bench.binary, '.'], {
    cwd: BENCH_DIR,
    env: { CGO_ENABLED: '0', TMPDIR: TMP },
  });
  const listed = (await run(bench.binary, ['list'])).stdout
    .split('\n')
    .filter((line) => line !== '');
  const planned = [...allWorkloads()].sort();
  if (JSON.stringify([...listed].sort()) !== JSON.stringify(planned))
    throw new Error(`The Go workloads (${listed.join(', ')}) and plan.ts disagree.`);
}

interface Stage {
  readonly context: Context;
  readonly target: Target;
  readonly dir: string;
  readonly index: number;
}

async function measureOne(stage: Stage, name: string, keep: boolean): Promise<void> {
  const { context, target, dir, index } = stage;
  const out = await bencher(target, [
    'run',
    '-dir',
    dir,
    '-workload',
    name,
    '-kind',
    target.kind,
    '-run',
    String(index),
    ...goArgs(context, target),
  ]);
  if (!keep) return;
  RESULT.parse(JSON.parse(out));
  await appendFile(context.resultsFile, out.endsWith('\n') ? out : `${out}\n`);
  process.stdout.write(`${target.kind} run ${String(index)} ${out.trim()}\n`);
}

async function runPhases(stage: Stage, phases: Phases): Promise<void> {
  for (const name of phases.cold) await measureOne(stage, name, true);
  for (const name of phases.warm) {
    const cold = name.replace('warm', 'cold');
    if (!phases.cold.includes(cold)) await measureOne(stage, cold, false);
    await measureOne(stage, name, true);
  }
  for (const name of phases.rest) await measureOne(stage, name, true);
}

interface Round {
  readonly index: number;
  readonly phases: Phases;
  readonly last: boolean;
}

async function turn(context: Context, target: Target, round: Round): Promise<void> {
  const dir = join(target.root, BENCH_FOLDER, `run-${String(round.index)}`);
  const stage: Stage = { context, target, dir, index: round.index };
  await target.mount();
  try {
    const datasets = datasetsFor(round.phases);
    await bencher(target, [
      'prepare',
      '-dir',
      dir,
      '-datasets',
      datasets.length === 0 ? 'none' : datasets.join(','),
      ...goArgs(context, target),
    ]);
    await target.unmount();
    await target.mount();
    await runPhases(stage, round.phases);
    await bencher(target, [
      'cleanup',
      '-dir',
      round.last ? join(target.root, BENCH_FOLDER) : dir,
      ...target.drain(),
    ]);
  } finally {
    await target.unmount();
  }
}

async function revision(): Promise<string> {
  const head = (await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO })).stdout.trim();
  const dirty =
    (
      await run('git', ['status', '--porcelain', '--', 'tooling/drive-mount'], { cwd: REPO })
    ).stdout.trim() !== '';
  return dirty ? `${head} with uncommitted helper changes` : head;
}

function includes(config: Config, kind: string): boolean {
  return (
    config.kinds.length === 0 || config.kinds.includes(kind) || (kind === 'se' && config.sweep)
  );
}

export async function writeReport(config: Config, resultsFile: string): Promise<string> {
  const report = (await run(bench.binary, ['report', '-in', resultsFile, '-title', ''])).stdout;
  const medians = summary(await readFile(resultsFile, 'utf8'));
  const best = bestMaxBackground(medians);
  const lines = [
    `# Drive mount speed benchmark ${config.stamp}`,
    '',
    '## Setup',
    '',
    ...(config.kinds.length === 0
      ? []
      : [
          `- Command: \`node --import tsx tooling/drive-fs-rig/bench/cli.ts run --kinds ${config.kinds.join(',')} --runs ${String(config.runs)}${config.sweep ? ' --sweep' : ''}${config.small ? ' --small' : ''}\``,
        ]),
    ...(includes(config, 'se')
      ? [`- Helper: ${config.helper === null ? await revision() : `the binary ${config.helper}`}`]
      : []),
    ...(includes(config, 'se')
      ? [
          '- Drive side: the production Hub on the NAS over its LAN route (pinned TLS), the SE-bench folder in the owner personal drive, created and removed by the run.',
        ]
      : []),
    ...(includes(config, 'nfs')
      ? [
          '- NFS side: a rootless user-space NFSv3 server (go-nfs, one process, writes sent as stable are fsynced before the reply, unstable writes are fsynced at the COMMIT, as the kernel server does) on the NAS, exporting a folder on the same btrfs disk that holds the Hub data, mounted with sudo -n mount (vers=3, tcp, rsize and wsize 1 MiB, hard, nolock). No root exists on the NAS, so this is not the kernel nfsd: a user-space server pays more per request than the kernel does, which makes the NFS numbers on metadata-heavy workloads slower than a kernel NFS server would give, and a ratio against them is weaker evidence than one against the kernel server.',
        ]
      : []),
    '- Method: runs alternate between the mount kinds, each run has a fresh mount for the cold workloads, medians, p95 and spread (max minus min over median) come from the runs, the ratio is the median time over the NFS median time and a workload is over when it exceeds 1.10 or NFS own spread when that is larger.',
    '- Writes count until the data is on the server: closing and fsync, then for the drive mount the wait until the helper reports no pending uploads (the drain column), for NFS the close already includes it.',
    ...(best === null
      ? []
      : [
          `- MaxBackground sweep: best value ${String(best.value)} (geometric mean ${best.score.toFixed(3)} of the slowdown against the fastest value per workload).`,
        ]),
    '',
    '## Results',
    '',
    report,
  ];
  const file = join(RESULTS, `bench-${config.stamp}.md`);
  await mkdir(RESULTS, { recursive: true });
  await writeFile(file, `${lines.join('\n')}\n`);
  return file;
}

async function mainTurns(context: Context, drive: Drive | null): Promise<void> {
  const { config } = context;
  const phases = phasesFor(config.workloads);
  const targets = new Map<string, Target>();
  if (config.kinds.includes('nfs')) targets.set('nfs', nfsTarget());
  if (drive !== null && config.kinds.includes('se'))
    targets.set('se', seTarget(drive.production, null, drive.binary));
  const turns = schedule([...targets.keys()], config.runs);
  const lasts = new Map<string, number>();
  for (const item of turns) lasts.set(item.kind, item.run);
  for (const { run: index, kind } of turns) {
    const target = targets.get(kind);
    if (target !== undefined)
      await turn(context, target, { index, phases, last: lasts.get(kind) === index });
  }
}

async function sweepTurns(context: Context, drive: Drive): Promise<void> {
  const { config } = context;
  const names =
    config.workloads === null
      ? SWEEP_WORKLOADS
      : SWEEP_WORKLOADS.filter((name) => config.workloads?.includes(name) === true);
  const phases = phasesFor(names);
  const targets = SWEEP_VALUES.map((value) => seTarget(drive.production, value, drive.binary));
  const turns = schedule(
    targets.map((target) => target.kind),
    SWEEP_RUNS,
  );
  const lasts = new Map<string, number>();
  for (const item of turns) lasts.set(item.kind, item.run);
  for (const { run: index, kind } of turns) {
    const target = targets.find((candidate) => candidate.kind === kind);
    if (target !== undefined)
      await turn(context, target, { index, phases, last: lasts.get(kind) === index });
  }
}

export async function runBenchmark(config: Config): Promise<string> {
  await mkdir(BENCH, { recursive: true, mode: 0o700 });
  await mkdir(RESULTS, { recursive: true });
  await buildBench();
  const phases = phasesFor(config.workloads);
  const needsSources = phases.rest.some((name) => name === 'untar' || name === 'clone');
  const context: Context = {
    config,
    fixtures: needsSources ? await ensureFixtures() : null,
    resultsFile: join(RESULTS, `bench-${config.stamp}.jsonl`),
  };
  await writeFile(context.resultsFile, '');
  try {
    if (config.kinds.includes('nfs')) await startNfsServer();
    let drive: Drive | null = null;
    if (config.kinds.includes('se') || config.sweep) {
      const binary = config.helper ?? (await buildHelper());
      drive = { production: await pairBenchComputer(), binary };
    }
    await mainTurns(context, drive);
    if (config.sweep && drive !== null) await sweepTurns(context, drive);
    return await writeReport(config, context.resultsFile);
  } finally {
    await teardown();
  }
}

async function removeEmpty(point: string): Promise<void> {
  try {
    await rmdir(point);
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
  }
}

async function scratchCleanup(): Promise<void> {
  const keep = new Set([bench.cache, bench.nfsMount, bench.seMount].map((path) => basename(path)));
  let entries: string[] = [];
  try {
    entries = await readdir(BENCH);
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
  }
  for (const entry of entries.filter((name) => !keep.has(name)))
    await rm(join(BENCH, entry), { recursive: true, force: true });
  for (const point of [bench.nfsMount, bench.seMount]) await removeEmpty(point);
}

export async function teardown(): Promise<void> {
  const failures: unknown[] = [];
  const steps = [
    async (): Promise<void> => {
      if (await isMounted(bench.nfsMount))
        await run('sudo', ['-n', 'umount', '-l', bench.nfsMount]);
    },
    async (): Promise<void> => {
      const errors = (await nfsServerErrors()).trim();
      if (errors !== '') process.stderr.write(`NFS server log:\n${errors}\n`);
    },
    stopNfsServer,
    revokeBenchComputer,
    scratchCleanup,
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'Cleanup left something behind.');
}

export async function clean(everything: boolean): Promise<void> {
  await teardown();
  if (everything) await rm(BENCH, { recursive: true, force: true });
}

export async function reportOnly(file: string, stamp: string): Promise<string> {
  await buildBench();
  const shape = shapeOf(await readFile(file, 'utf8'));
  const config: Config = {
    kinds: shape.kinds,
    runs: shape.runs,
    workloads: null,
    sweep: shape.sweep,
    small: false,
    helper: null,
    stamp,
  };
  try {
    return await writeReport(config, file);
  } finally {
    await rm(bench.bin, { recursive: true, force: true });
  }
}
