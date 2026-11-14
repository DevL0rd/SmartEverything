import { migrateAppPublications } from './self-update-app-migration.ts';
import {
  APP_PUBLICATION,
  APP_PUBLICATION_INPUT,
  PAIRED_ANDROID_BUILD,
  type AndroidAppObservation,
  type AppPublicationInput,
  type AppPublication,
  type AppPublicationResult,
  type PairedAndroidBuild,
} from '@smarteverything/domain';
import { join } from 'node:path';
import { z } from 'zod';
import { withAppUpdateLock } from '../apps/hub/src/app-updates/lock.ts';
import {
  changeJob,
  isFinished,
  jobs,
  readJob,
  startJob,
  type JobStore,
  type UpdateJob,
} from './self-update-job.ts';

const LOCK_FILE = 'app-updates.write.lock';

type Refusal = 'missing_target' | 'test_requires_device' | 'target_changed' | 'preflight';

export interface PublicationPorts {
  readonly store: JobStore;
  readonly observations: (clientId?: string) => Promise<readonly PairedAndroidBuild[]>;
  readonly publish: (
    input: AppPublicationInput,
    currentTargets: () => Promise<readonly PairedAndroidBuild[]>,
  ) => Promise<void>;
  readonly inspect: (input: AppPublicationInput) => Promise<AppPublication | null>;
}

export class AppPublicationRefused extends Error {
  override readonly name = 'AppPublicationRefused';

  constructor(
    readonly reason: Refusal,
    detail: string | null = null,
  ) {
    super(detail === null ? reason : `${reason}: ${detail}`);
  }
}

const NO_PUBLICATION = 'No committed publication could be found for this request.';

export class AppPublicationConflict extends Error {
  override readonly name = 'AppPublicationConflict';
}

function sameRequest(held: AppPublicationInput, input: AppPublicationInput): boolean {
  return (
    held.action === input.action &&
    held.runId === input.runId &&
    held.clientId === input.clientId &&
    held.channel === input.channel &&
    held.commit === input.commit &&
    held.notes === input.notes
  );
}

function sameBuild(left: AndroidAppObservation, right: AndroidAppObservation): boolean {
  return (
    left.applicationId === right.applicationId &&
    left.versionCode === right.versionCode &&
    left.runtimeVersion === right.runtimeVersion &&
    left.currentUpdateId === right.currentUpdateId &&
    left.channel === right.channel
  );
}

async function readTarget(
  ports: PublicationPorts,
  input: AppPublicationInput,
): Promise<readonly PairedAndroidBuild[]> {
  if (input.clientId === undefined && input.channel === 'dev')
    throw new AppPublicationRefused('test_requires_device');
  const targets = z.array(PAIRED_ANDROID_BUILD).parse(await ports.observations(input.clientId));
  const eligible = targets.filter(
    ({ clientId, observation }) =>
      observation.channel === input.channel &&
      (input.clientId === undefined || input.clientId === clientId),
  );
  if (eligible.length === 0) throw new AppPublicationRefused('missing_target');
  return eligible.sort((left, right) => left.clientId.localeCompare(right.clientId));
}

function targetReader(
  ports: PublicationPorts,
  input: AppPublicationInput,
  original: readonly PairedAndroidBuild[],
): () => Promise<readonly PairedAndroidBuild[]> {
  return async () => {
    const current = await readTarget(ports, input);
    if (
      current.length !== original.length ||
      !current.every((entry, index) => {
        const before = original[index];
        return (
          before?.clientId === entry.clientId && sameBuild(before.observation, entry.observation)
        );
      })
    )
      throw new AppPublicationRefused('target_changed');
    return current;
  };
}

function lazyTargets(
  ports: PublicationPorts,
  input: AppPublicationInput,
): () => Promise<readonly PairedAndroidBuild[]> {
  let readCurrent: (() => Promise<readonly PairedAndroidBuild[]>) | undefined;
  return async () => {
    if (readCurrent !== undefined) return readCurrent();
    const original = await readTarget(ports, input);
    readCurrent = targetReader(ports, input, original);
    return original;
  };
}

function refusal(store: JobStore, job: UpdateJob, reason: string): AppPublicationResult {
  changeJob(store, job, { phase: 'refused', detail: reason });
  return { status: 'refused', runId: job.runId, reason };
}

async function reconcile(
  ports: Pick<PublicationPorts, 'store' | 'inspect'>,
  job: UpdateJob,
  input: AppPublicationInput,
): Promise<AppPublicationResult> {
  const published = APP_PUBLICATION.nullable().parse(await ports.inspect(input));
  if (published === null) {
    changeJob(ports.store, job, { phase: 'failed', detail: NO_PUBLICATION });
    return { status: 'failed', runId: job.runId, reason: NO_PUBLICATION };
  }
  if (published.id !== job.runId || published.clientId !== (input.clientId ?? null))
    throw new AppPublicationConflict(
      'The durable publication belongs to another request or device.',
    );
  if (input.action === 'ui' && published.desktop === null) {
    changeJob(ports.store, job, { phase: 'running', result: published });
    return { status: 'partial', runId: job.runId, publication: published };
  }
  changeJob(ports.store, job, { phase: 'published', result: published });
  return { status: 'published', runId: job.runId, publication: published };
}

async function publish(
  ports: PublicationPorts,
  job: UpdateJob,
  input: AppPublicationInput,
): Promise<AppPublicationResult> {
  let running = job;
  try {
    const targets =
      input.action === 'ui'
        ? lazyTargets(ports, input)
        : targetReader(ports, input, await readTarget(ports, input));
    running = changeJob(ports.store, job, { phase: 'running' });
    await ports.publish(input, targets);
    running = readJob(ports.store, job.runId) ?? running;
  } catch (error) {
    if (!(error instanceof AppPublicationRefused)) throw error;
    if (input.action === 'ui' && (await ports.inspect(input)) !== null)
      return reconcile(ports, running, input);
    return refusal(ports.store, running, error.message);
  }
  return await reconcile(ports, running, input);
}

function isPublication(job: UpdateJob): boolean {
  return job.action === 'app' || job.action === 'ui';
}

function overlaps(held: AppPublicationInput, input: AppPublicationInput): boolean {
  return (
    held.channel === input.channel &&
    (held.clientId === undefined ||
      input.clientId === undefined ||
      held.clientId === input.clientId)
  );
}

async function reconcileConflicts(
  input: AppPublicationInput,
  ports: PublicationPorts,
): Promise<void> {
  for (const job of jobs(ports.store)) {
    if (isFinished(job) || job.runId === input.runId || !isPublication(job)) continue;
    const held = APP_PUBLICATION_INPUT.parse(job.input);
    if (overlaps(held, input)) await reconcile(ports, job, held);
  }
}

function settledResult(job: UpdateJob): AppPublicationResult | null {
  if (job.phase === 'published') {
    const publication = APP_PUBLICATION.parse(job.result);
    const status = job.action === 'ui' && publication.desktop === null ? 'partial' : 'published';
    return { status, runId: job.runId, publication };
  }
  if (job.phase === 'refused' || job.phase === 'failed')
    return { status: job.phase, runId: job.runId, reason: z.string().parse(job.detail) };
  return null;
}

async function runLocked(
  input: AppPublicationInput,
  ports: PublicationPorts,
): Promise<AppPublicationResult> {
  const existing = readJob(ports.store, input.runId);
  if (existing !== null) {
    if (
      !isPublication(existing) ||
      !sameRequest(APP_PUBLICATION_INPUT.parse(existing.input), input)
    )
      throw new AppPublicationConflict('This request ID is already in use for a different update.');
    const settled = settledResult(existing);
    if (settled !== null) return settled;
    if (existing.phase !== 'planned') {
      const result = await reconcile(ports, existing, input);
      if (result.status !== 'partial') return result;
    }
  }
  await reconcileConflicts(input, ports);
  const job =
    existing ?? startJob({ ...ports.store, newId: () => input.runId }, input.action, input, null);
  return publish(ports, job, input);
}

export function readAppPublication(
  runId: string,
  ports: Pick<PublicationPorts, 'store' | 'inspect'>,
): Promise<AppPublicationResult | null> {
  return withAppUpdateLock(join(ports.store.folder, LOCK_FILE), async () => {
    migrateAppPublications(ports.store);
    const job = readJob(ports.store, runId);
    if (job === null || !isPublication(job)) return null;
    return settledResult(job) ?? reconcile(ports, job, APP_PUBLICATION_INPUT.parse(job.input));
  });
}

export function runAppPublication(
  input: AppPublicationInput,
  ports: PublicationPorts,
): Promise<AppPublicationResult> {
  const checked = APP_PUBLICATION_INPUT.parse(input);
  return withAppUpdateLock(join(ports.store.folder, LOCK_FILE), () => {
    migrateAppPublications(ports.store);
    return runLocked(checked, ports);
  });
}
