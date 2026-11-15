import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { delta, sample } from './local-load.ts';
import { SCALES, type Probed, type Session } from './local-types.ts';
import { BENCH_FOLDER, bench } from './paths.ts';
import { datasetsFor, type Phases } from './plan.ts';

const WORKLOAD_TIMEOUT_MS = Number(env['DRIVE_BENCH_TIMEOUT_S'] ?? '2700') * 1000;

export interface Stage {
  readonly session: Session;
  readonly target: Probed;
  readonly dir: string;
  readonly index: number;
}

function timed(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      { timeout: WORKLOAD_TIMEOUT_MS, maxBuffer: 64 << 20 },
      (failure, stdout, stderr) => {
        if (failure === null) resolve(stdout);
        else
          reject(
            new Error(
              `${failure.killed === true ? 'timed out; ' : ''}${failure.message}\n${stderr.slice(-2000)}`,
            ),
          );
      },
    );
  });
}

async function bencher(target: Probed, args: readonly string[]): Promise<string> {
  const wrapped = target.wrap(bench.binary, args);
  return timed('env', ['GODEBUG=asyncpreemptoff=1', wrapped.command, ...wrapped.args]);
}

function drainFlags(target: Probed): string[] {
  return ['-drain-idle', '30s', '-drain-tolerate', ...target.drain()];
}

function goArgs(session: Session, target: Probed): string[] {
  const sources =
    session.fixtures === null
      ? []
      : ['-tarball', session.fixtures.tarball, '-mirror', session.fixtures.mirror];
  return [
    ...(SCALES[session.config.scale] ?? []),
    ...sources,
    '-tolerate-eio',
    ...drainFlags(target),
  ];
}

function labelOf(stage: Stage, name: string): string {
  return `${stage.target.kind}.run${String(stage.index)}.${name}`;
}

async function recordFailure(stage: Stage, name: string, cause: unknown): Promise<void> {
  const message = cause instanceof Error ? cause.message : String(cause);
  const { target, session, index } = stage;
  if (message.includes('timed out')) await target.diagnose?.(labelOf(stage, name));
  await target.recover?.();
  await appendFile(
    session.failures,
    `${JSON.stringify({ kind: target.kind, run: index, workload: name, error: message.slice(0, 1500) })}\n`,
  );
  process.stdout.write(`${target.kind} run ${String(index)} ${name} FAILED\n`);
}

async function runWorkload(stage: Stage, name: string): Promise<string> {
  const { target, session, dir, index } = stage;
  return bencher(target, [
    'run',
    '-dir',
    dir,
    '-workload',
    name,
    '-kind',
    target.kind,
    '-run',
    String(index),
    ...goArgs(session, target),
  ]);
}

async function measure(stage: Stage, name: string, keep: boolean): Promise<void> {
  const { target, session, index } = stage;
  const roles = target.roles();
  await target.before?.();
  const before = await sample(roles);
  let out: string;
  try {
    out = await runWorkload(stage, name);
  } catch (cause) {
    await recordFailure(stage, name, cause);
    return;
  }
  const after = await sample(roles);
  if (!keep) return;
  await target.after?.(labelOf(stage, name));
  await appendFile(session.results, out.endsWith('\n') ? out : `${out}\n`);
  await appendFile(
    session.loads,
    `${JSON.stringify({ kind: target.kind, run: index, workload: name, ...delta(before, after) })}\n`,
  );
  process.stdout.write(`${target.kind} run ${String(index)} ${out.trim()}\n`);
}

async function phasesOf(stage: Stage, phases: Phases): Promise<void> {
  for (const name of phases.cold) await measure(stage, name, true);
  for (const name of phases.warm) {
    const cold = name.replace('warm', 'cold');
    if (!phases.cold.includes(cold)) await measure(stage, cold, false);
    await measure(stage, name, true);
  }
  for (const name of phases.rest) await measure(stage, name, true);
}

export interface Turn {
  readonly session: Session;
  readonly target: Probed;
  readonly index: number;
  readonly phases: Phases;
  readonly last: boolean;
}

export async function turn(input: Turn): Promise<void> {
  const { session, target, index, phases, last } = input;
  const dir = join(target.root, BENCH_FOLDER, `run-${String(index)}`);
  const stage: Stage = { session, target, dir, index };
  await target.mount();
  try {
    const datasets = datasetsFor(phases);
    await bencher(target, [
      'prepare',
      '-dir',
      dir,
      '-datasets',
      datasets.length === 0 ? 'none' : datasets.join(','),
      ...goArgs(session, target),
    ]);
    await target.unmount();
    await target.mount();
    await phasesOf(stage, phases);
    await bencher(target, [
      'cleanup',
      '-dir',
      last ? join(target.root, BENCH_FOLDER) : dir,
      ...drainFlags(target),
    ]);
  } finally {
    await target.unmount();
  }
}
