import { spawn } from 'node:child_process';
import { join } from 'node:path';
import {
  APP_PUBLICATION_RESULT,
  DESKTOP_RELEASE_RESULT,
  HUB_UPDATE_ACCEPTANCE,
  MACHINE_UPDATE_ARCHES,
  UPDATE_PIPELINE_OWNER,
  failedBecause,
  hubUpdateOutcome,
  type HubUpdateRelease,
  type UpdateRevision,
  type UpdateRevisionStep,
} from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import { loadRelease } from '../updates/release-folder';
import { runConfiguredUpdateCommand, runUpdateCommand, UpdateBusyError } from './command';
import type { StepOutcome } from './release-queue';
import { configuredSourceCheck } from './source';
import { withHubReleaseLock } from './release-lock';
import { readHubUpdate } from './recovery';

const EXECUTOR_LOCK = 'executor.lock';
const BUSY_RETRIES = 2;

export interface StepDependencies {
  readonly layout: HubLayout;
  readonly publicServer: () => string;
  readonly finished: (runId: string) => Promise<HubUpdateRelease>;
}

async function lockFree(file: string): Promise<void> {
  const holder = spawn('flock', [file, 'true'], { stdio: 'ignore' });
  const code = await new Promise<number | null>((resolve, reject) => {
    holder.once('error', reject);
    holder.once('close', resolve);
  });
  if (code !== 0)
    throw new Error(`Waiting for the update lock failed with exit code ${String(code)}.`);
}

export async function untilIdle(layout: HubLayout): Promise<void> {
  await withHubReleaseLock(layout, true, () => Promise.resolve());
  await lockFree(join(layout.system.updates.selfUpdate, EXECUTOR_LOCK));
}

export async function whenIdle<T>(
  idle: () => Promise<void>,
  attempt: () => Promise<T>,
): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt();
    } catch (cause) {
      if (!(cause instanceof UpdateBusyError) || tries > BUSY_RETRIES) throw cause;
      await idle();
    }
  }
}

function rollbackOf(release: HubUpdateRelease): 'none' | 'reverted' | 'unrecoverable' {
  const outcome = hubUpdateOutcome(release);
  return outcome === 'reverted' || outcome === 'unrecoverable' ? outcome : 'none';
}

function hubFailure(release: HubUpdateRelease): StepOutcome {
  const detail = release.reason ?? failedBecause(release.failedChecks);
  return {
    status: 'failed',
    message: `${detail.length === 0 ? 'The Hub update failed.' : detail} Hub update ${release.runId} ended as ${release.phase}.`,
    rollback: rollbackOf(release),
  };
}

export function movedPastPlan(tip: string, planned: string): StepOutcome | null {
  return tip === planned
    ? null
    : {
        status: 'failed',
        message: `The remote branch moved to ${tip} after revision ${planned} was planned, so the Hub update was not started.`,
        rollback: 'none',
      };
}

async function startHub(
  deps: StepDependencies,
  requestId: string,
  planned: string,
): Promise<StepOutcome | null> {
  const { layout } = deps;
  const check = await configuredSourceCheck(layout, UPDATE_PIPELINE_OWNER);
  const moved = movedPastPlan(check.tip, planned);
  if (moved !== null) return moved;
  if (check.tipIsRunning === true) return { status: 'done', offered: false };
  if (check.offerId === undefined || check.notes === undefined)
    return {
      status: 'failed',
      message:
        check.applyBlockedBy === undefined
          ? 'The Hub has no update to apply for this revision, or its release notes do not match the running revision.'
          : `The Hub update cannot be applied: ${check.applyBlockedBy}.`,
      rollback: 'none',
    };
  const request = {
    action: 'remote',
    ownerClient: UPDATE_PIPELINE_OWNER,
    offerId: check.offerId,
    requestId,
    includePending: false,
  };
  const accepted = HUB_UPDATE_ACCEPTANCE.parse(
    await whenIdle(
      () => untilIdle(layout),
      () => runUpdateCommand(layout, request),
    ),
  );
  return accepted.status === 'refused'
    ? { status: 'failed', message: accepted.message, rollback: 'none' }
    : null;
}

export async function executeHub(
  deps: StepDependencies,
  revision: UpdateRevision,
  step: UpdateRevisionStep,
): Promise<StepOutcome> {
  const runId = step.runId;
  if (runId === null) throw new Error('A Hub step needs a request ID before it runs.');
  if ((await readHubUpdate(deps.layout, runId)) === null) {
    const early = await startHub(deps, runId, revision.tip);
    if (early !== null) return early;
  }
  const release = await deps.finished(runId);
  return hubOutcome(release);
}

function hubOutcome(release: HubUpdateRelease): StepOutcome {
  return hubUpdateOutcome(release) === 'updated'
    ? { status: 'done', offered: false }
    : hubFailure(release);
}

async function desktopArches(
  layout: HubLayout,
): Promise<readonly (typeof MACHINE_UPDATE_ARCHES)[number][]> {
  const manifest = await loadRelease(layout.system.updates.machineUpdates);
  const artifacts = manifest?.artifacts ?? [];
  const kept = MACHINE_UPDATE_ARCHES.filter((arch) =>
    artifacts.some((artifact) => artifact.platform === 'linux' && artifact.arch === arch),
  );
  return kept.length > 0 ? kept : MACHINE_UPDATE_ARCHES.filter((arch) => arch === process.arch);
}

export async function publicationInput(
  deps: StepDependencies,
  revision: UpdateRevision,
  step: UpdateRevisionStep,
): Promise<{
  readonly script: 'self-update-app-command.ts' | 'self-update-desktop-command.ts';
  readonly input: Record<string, unknown>;
}> {
  const common = { runId: step.runId, notes: revision.notes, commit: revision.tip };
  if (step.component === 'desktop')
    return {
      script: 'self-update-desktop-command.ts',
      input: { action: 'desktop', ...common, arches: await desktopArches(deps.layout) },
    };
  return { script: 'self-update-app-command.ts', input: { action: step.component, ...common } };
}

export function publishedOutcome(result: unknown, desktop: boolean): StepOutcome {
  const parsed = (desktop ? DESKTOP_RELEASE_RESULT : APP_PUBLICATION_RESULT).parse(result);
  if (parsed.status === 'published') return { status: 'done', offered: true };
  const reason = 'reason' in parsed ? parsed.reason : 'Only some devices were offered the update.';
  return { status: 'failed', message: `Publication ${parsed.status}: ${reason}`, rollback: 'none' };
}

export async function executePublication(
  deps: StepDependencies,
  revision: UpdateRevision,
  step: UpdateRevisionStep,
): Promise<StepOutcome> {
  const { script, input } = await publicationInput(deps, revision, step);
  const server = deps.publicServer();
  const result = await whenIdle(
    () => untilIdle(deps.layout),
    () => runConfiguredUpdateCommand(script, deps.layout, { input, server }),
  );
  return publishedOutcome(result, step.component === 'desktop');
}
