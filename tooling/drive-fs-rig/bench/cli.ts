import { argv, exit, stdout } from 'node:process';
import { parseArgs } from 'node:util';
import { basename } from 'node:path';
import { checkSelection, DEFAULT_RUNS } from './plan.ts';
import { LOCAL_KINDS, cleanLocal, runLocal, type LocalConfig } from './local.ts';
import { localReport } from './local-report.ts';
import { clean, reportOnly, runBenchmark, type Config } from './session.ts';
import { stampNow } from './summary.ts';
import { INSTANCE, RESULTS } from './paths.ts';

const USAGE = `bench <command>

  run [--kinds nfs,se] [--runs 5] [--workloads a,b,c] [--sweep] [--small]
      runs the workloads on the kinds, alternating, writes ${RESULTS}/bench-<stamp>.jsonl and .md
      nfs  rootless user-space NFS server on the NAS (started and removed by the run)
      se   the drive mount on the production Hub (bench computer paired and revoked by the run)
      --sweep adds the MaxBackground sweep 12, 64, 128 on the drive mount
      --small uses small sizes to check the tooling
      --helper <binary> uses that helper binary on the drive mount instead of building the checkout's
  local [--kinds nfs,smb,sshfs,...] [--runs 3] [--workloads a,b] [--scale local|small|full] [--first-run 2]
      runs everything on this PC against one disk folder, in a scratch Hub instance named by DRIVE_RIG_INSTANCE (required)
      kinds: ${LOCAL_KINDS.join(', ')}
  local-report <results prefix without .jsonl>   per workload tables and the drive mount breakdown as markdown
  local-clean              unmount, stop and remove every server, export and scratch file of the local instance
  report <results.jsonl>   rebuild the markdown report of a results file
  clean [--all]            stop the NFS server, revoke the bench computer, remove the scratch files (--all also the git mirror kept for the next run)
`;

function parseKinds(value: string | undefined): readonly string[] {
  const kinds = (value ?? 'nfs,se').split(',').filter((kind) => kind !== '');
  for (const kind of kinds)
    if (kind !== 'nfs' && kind !== 'se') throw new Error(`Unknown kind ${kind}; use nfs or se.`);
  return kinds;
}

function parseRuns(value: string | undefined): number {
  const runs = value === undefined ? DEFAULT_RUNS : Number(value);
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error('--runs must be a whole number of at least 1.');
  return runs;
}

function parseWorkloads(value: string | undefined): readonly string[] | null {
  if (value === undefined) return null;
  const workloads = value.split(',').filter((name) => name !== '');
  checkSelection(workloads);
  return workloads;
}

export function parseRun(args: readonly string[], now: Date): Config {
  const { values } = parseArgs({
    args: [...args],
    options: {
      kinds: { type: 'string' },
      runs: { type: 'string' },
      workloads: { type: 'string' },
      sweep: { type: 'boolean' },
      small: { type: 'boolean' },
      helper: { type: 'string' },
    },
  });
  return {
    kinds: parseKinds(values.kinds),
    runs: parseRuns(values.runs),
    workloads: parseWorkloads(values.workloads),
    sweep: values.sweep ?? false,
    small: values.small ?? false,
    helper: values.helper ?? null,
    stamp: stampNow(now),
  };
}

export function parseLocal(args: readonly string[], now: Date, instance: string): LocalConfig {
  if (instance === '')
    throw new Error('Set DRIVE_RIG_INSTANCE so the local benchmark never touches the default rig.');
  const { values } = parseArgs({
    args: [...args],
    options: {
      kinds: { type: 'string' },
      runs: { type: 'string' },
      workloads: { type: 'string' },
      scale: { type: 'string' },
      'first-run': { type: 'string' },
    },
  });
  const kinds = (values.kinds ?? LOCAL_KINDS.join(',')).split(',').filter((kind) => kind !== '');
  const unknown = kinds.filter((kind) => !LOCAL_KINDS.some((known) => known === kind));
  if (unknown.length > 0) throw new Error(`Unknown kind ${unknown.join(', ')}.`);
  const scale = values.scale ?? 'local';
  if (!['local', 'small', 'full'].includes(scale))
    throw new Error('--scale is local, small or full.');
  return {
    kinds,
    runs: parseRuns(values.runs ?? '3'),
    workloads: parseWorkloads(values.workloads),
    scale,
    firstRun: values['first-run'] === undefined ? 1 : parseRuns(values['first-run']),
    stamp: stampNow(now),
  };
}

async function main(): Promise<number> {
  const [command, ...rest] = argv.slice(2);
  if (command === 'run') {
    stdout.write(`${await runBenchmark(parseRun(rest, new Date()))}\n`);
    return 0;
  }
  if (command === 'local') {
    stdout.write(`${await runLocal(parseLocal(rest, new Date(), INSTANCE))}\n`);
    return 0;
  }
  if (command === 'local-report' && rest[0] !== undefined) {
    stdout.write(`${await localReport(rest[0])}\n`);
    return 0;
  }
  if (command === 'local-clean') {
    await cleanLocal();
    return 0;
  }
  if (command === 'report' && rest[0] !== undefined) {
    const stamp = basename(rest[0])
      .replace(/^bench-/u, '')
      .replace(/\.jsonl$/u, '');
    stdout.write(`${await reportOnly(rest[0], stamp)}\n`);
    return 0;
  }
  if (command === 'clean') {
    await clean(rest.includes('--all'));
    return 0;
  }
  stdout.write(USAGE);
  return command === undefined ? 0 : 2;
}

if (import.meta.main) {
  try {
    exit(await main());
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    exit(1);
  }
}
