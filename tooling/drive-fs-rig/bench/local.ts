import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { down } from '../lifecycle.ts';
import { run } from '../processes.ts';
import { ensureFixtures } from './fixtures.ts';
import { buildHelper } from './helper.ts';
import { probeRoot, startLocalHub } from './local-hub.ts';
import { serveFolder, stopShared } from './local-servers.ts';
import { seKind, type SeVariant } from './local-se.ts';
import { turn } from './local-measure.ts';
import {
  davfsTarget,
  nfsTarget,
  rcloneTarget,
  smbTarget,
  sshfsTarget,
  type LocalTarget,
} from './local-targets.ts';
import type { LocalConfig, Probed, Session } from './local-types.ts';
import { isMounted } from './mounts.ts';
import { BENCH, BENCH_FOLDER, RESULTS } from './paths.ts';
import { phasesFor, schedule } from './plan.ts';
import { buildBench } from './session.ts';

export type { LocalConfig } from './local-types.ts';

export const LOCAL_KINDS = [
  'nfs',
  'smb',
  'sshfs',
  'rclone-sftp-off',
  'rclone-sftp-full',
  'rclone-dav-off',
  'rclone-dav-full',
  'davfs',
  'se',
  'se-mb64',
  'se-par',
] as const;

const SE_VARIANTS: readonly SeVariant[] = [
  { kind: 'se', maxBackground: null, parallel: false },
  { kind: 'se-mb64', maxBackground: 64, parallel: false },
  { kind: 'se-par', maxBackground: null, parallel: true },
];

const OTHERS: Readonly<Record<string, () => LocalTarget>> = {
  nfs: nfsTarget,
  smb: smbTarget,
  sshfs: sshfsTarget,
  'rclone-sftp-off': () => rcloneTarget('sftp', 'off'),
  'rclone-sftp-full': () => rcloneTarget('sftp', 'full'),
  'rclone-dav-off': () => rcloneTarget('dav', 'off'),
  'rclone-dav-full': () => rcloneTarget('dav', 'full'),
  davfs: davfsTarget,
};

async function targetsFor(session: Session): Promise<Map<string, Probed>> {
  const targets = new Map<string, Probed>();
  const wanted = session.config.kinds;
  if (wanted.some((kind) => kind.startsWith('se'))) {
    const binary = await buildHelper();
    const hub = await startLocalHub(false);
    for (const variant of SE_VARIANTS)
      if (wanted.includes(variant.kind))
        targets.set(variant.kind, seKind({ hub, binary, session, variant }));
  }
  for (const kind of wanted) {
    const make = OTHERS[kind];
    if (make !== undefined) targets.set(kind, make());
  }
  return targets;
}

async function recordTurnFailure(
  session: Session,
  kind: string,
  index: number,
  cause: unknown,
): Promise<void> {
  const message = cause instanceof Error ? cause.message : String(cause);
  await appendFile(
    session.failures,
    `${JSON.stringify({ kind, run: index, workload: '(turn)', error: message.slice(0, 1500) })}\n`,
  );
  process.stdout.write(`${kind} run ${String(index)} turn FAILED\n`);
}

async function runTurns(session: Session, targets: Map<string, Probed>): Promise<void> {
  const { config } = session;
  const phases = phasesFor(config.workloads);
  const turns = schedule([...targets.keys()], config.runs);
  const lasts = new Map<string, number>();
  for (const item of turns) lasts.set(item.kind, item.run);
  for (const { run: index, kind } of turns) {
    const target = targets.get(kind);
    if (target === undefined) continue;
    try {
      if (!kind.startsWith('se'))
        await rm(join(serveFolder, BENCH_FOLDER), { recursive: true, force: true });
      await turn({ session, target, index, phases, last: lasts.get(kind) === index });
    } catch (cause) {
      await recordTurnFailure(session, kind, index, cause);
    }
  }
}

export async function runLocal(config: LocalConfig): Promise<string> {
  for (const folder of [BENCH, RESULTS, serveFolder, probeRoot])
    await mkdir(folder, { recursive: true });
  await buildBench();
  const needsSources = phasesFor(config.workloads).rest.some(
    (name) => name === 'untar' || name === 'clone',
  );
  const prefix = join(RESULTS, `bench-local-${config.stamp}`);
  const session: Session = {
    config,
    fixtures: needsSources ? await ensureFixtures() : null,
    results: `${prefix}.jsonl`,
    failures: `${prefix}.failures.jsonl`,
    loads: `${prefix}.load.jsonl`,
    profiles: `${prefix}.prof`,
  };
  for (const file of [session.results, session.failures, session.loads]) await writeFile(file, '');
  try {
    const targets = await targetsFor(session);
    for (const target of targets.values()) await target.setup();
    await runTurns(session, targets);
  } finally {
    if (env['DRIVE_BENCH_KEEP'] === undefined) await cleanLocal();
  }
  return session.results;
}

async function mountedUnderScratch(): Promise<readonly string[]> {
  return (await readFile('/proc/self/mounts', 'utf8'))
    .split('\n')
    .map((line) => line.split(' ')[1])
    .filter((point): point is string => point?.startsWith(BENCH) === true);
}

async function unmountLazily(point: string): Promise<void> {
  try {
    await run('sudo', ['-n', 'umount', '-l', point]);
  } catch (cause) {
    process.stderr.write(
      `umount ${point}: ${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    await run('fusermount3', ['-uz', point]);
  }
}

async function reportFailure(step: Promise<unknown>): Promise<void> {
  try {
    await step;
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  }
}

export async function cleanLocal(): Promise<void> {
  for (const point of await mountedUnderScratch())
    if (await isMounted(point)) await unmountLazily(point);
  await reportFailure(stopShared());
  await reportFailure(down());
}
