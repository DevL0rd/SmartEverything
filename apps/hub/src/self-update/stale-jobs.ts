import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import {
  hubUpdateFinished,
  releaseOf,
  type HubUpdateLedger,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { HubLayout } from '../data-layout';
import { isMissing } from '../fs-util';
import { readHubUpdateLedger } from './recovery';

const log = new Logger('hub.self-update');
const execute = promisify(execFile);
const LOCK_BUSY = 75;
const EXECUTOR_LOCK = 'executor.lock';
const HUB_LOCK = 'hub-release.lock';
const PUBLICATION_PREFIX = 'publication-';
const UNFINISHED_PHASES: ReadonlySet<string> = new Set(['planned', 'running']);

const JOB = z.looseObject({
  runId: z.uuid(),
  action: z.string(),
  phase: z.string(),
  detail: z.string().nullable(),
  result: z.record(z.string(), z.unknown()),
});

const HUB_RESULT = z.looseObject({ runId: z.uuid() });

type Job = z.infer<typeof JOB>;

export interface JobSettlement {
  readonly runId: string;
  readonly phase: 'failed' | 'applied';
  readonly detail: string;
}

export async function lockHeld(lockFile: string): Promise<boolean> {
  await mkdir(dirname(lockFile), { recursive: true, mode: 0o700 });
  try {
    await execute('flock', ['-n', '--conflict-exit-code', String(LOCK_BUSY), lockFile, 'true']);
    return false;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === LOCK_BUSY) return true;
    throw cause;
  }
}

function hubOutcome(job: Job, release: HubUpdateRelease | null): JobSettlement | null {
  if (release === null)
    return {
      runId: job.runId,
      phase: 'failed',
      detail: 'The hub release record for this job is missing, so the release did not finish.',
    };
  if (!hubUpdateFinished(release)) return null;
  return release.phase === 'done'
    ? { runId: job.runId, phase: 'applied', detail: `The hub release ${release.runId} finished.` }
    : {
        runId: job.runId,
        phase: 'failed',
        detail: `The hub release ${release.runId} ended as ${release.phase}.`,
      };
}

async function settlementOf(
  job: Job,
  work: string,
  ledger: HubUpdateLedger,
): Promise<JobSettlement | null> {
  if (!UNFINISHED_PHASES.has(job.phase)) return null;
  const dead = (reason: string): JobSettlement => ({
    runId: job.runId,
    phase: 'failed',
    detail: reason,
  });
  if (job.action === 'file') return dead('The hub restarted before the file transfer finished.');
  if (job.action === 'hub') {
    const started = HUB_RESULT.safeParse(job.result);
    if (started.success) return hubOutcome(job, releaseOf(ledger, started.data.runId) ?? null);
    return (await lockHeld(join(work, HUB_LOCK)))
      ? null
      : dead('The hub update process ended before the release started.');
  }
  return (await lockHeld(join(work, EXECUTOR_LOCK)))
    ? null
    : dead('The update process ended unfinished: the hub restarted or the build was killed.');
}

async function readJobs(folder: string): Promise<readonly { file: string; job: Job }[]> {
  const names = await readdir(folder).catch((cause: unknown) => {
    if (isMissing(cause)) return [];
    throw cause;
  });
  const read = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => {
        const file = join(folder, name);
        const parsed = JOB.safeParse(JSON.parse(await readFile(file, 'utf8')));
        return parsed.success ? [{ file, job: parsed.data }] : [];
      }),
  );
  return read.flat();
}

async function removeStalePublications(work: string): Promise<void> {
  const stale = (await readdir(work)).filter((name) => name.startsWith(PUBLICATION_PREFIX));
  if (stale.length === 0) return;
  try {
    await execute('flock', [
      '-n',
      '--conflict-exit-code',
      String(LOCK_BUSY),
      join(work, EXECUTOR_LOCK),
      'rm',
      '-rf',
      '--',
      ...stale.map((name) => join(work, name)),
    ]);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === LOCK_BUSY) return;
    throw cause;
  }
}

export async function settleStaleUpdateJobs(
  layout: HubLayout,
  now: () => Date = () => new Date(),
): Promise<readonly JobSettlement[]> {
  const work = layout.system.updates.selfUpdate;
  const ledger = await readHubUpdateLedger(layout);
  const settled: JobSettlement[] = [];
  for (const { file, job } of await readJobs(join(work, 'jobs'))) {
    const settlement = await settlementOf(job, work, ledger);
    if (settlement === null) continue;
    const text = await readFile(file, 'utf8');
    const next = {
      ...z.record(z.string(), z.unknown()).parse(JSON.parse(text)),
      phase: settlement.phase,
      detail: settlement.detail,
      updatedAt: now().toISOString(),
    };
    await writeFile(`${file}.next`, `${JSON.stringify(next, null, 2)}\n`);
    await rename(`${file}.next`, file);
    log.warn('update_job.settled', { runId: settlement.runId, phase: settlement.phase });
    settled.push(settlement);
  }
  await removeStalePublications(work).catch((cause: unknown) => {
    if (!isMissing(cause)) throw cause;
  });
  return settled;
}
