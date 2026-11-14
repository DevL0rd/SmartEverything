import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  API_ENDPOINTS as E,
  ApiError,
  UPDATE_PUSH_PATH,
  UPDATE_PUSH_SECRET_FILE,
  type HubUpdateRelease,
  type UpdatePushSetup,
  type UpdateRevision,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ExtensionContext, RunningExtension, ServerExtension } from '../extensions';
import { readPushSecret, updatePushRoute } from '../server/handlers/self-update-push';
import { bound } from '../server/router';
import { PLAN_RESULT } from './plan-contract';
import {
  executeHub,
  executePublication,
  untilIdle,
  whenIdle,
  type StepDependencies,
} from './pipeline-steps';
import { repositoryOf, type PushTarget } from './push-webhook';
import {
  PipelineRefusal,
  ReleaseQueue,
  type Prepared,
  type QueuePorts,
  type StepOutcome,
} from './release-queue';
import { ReleaseWatch } from './release-watch';
import { RevisionRecord } from './revision-record';
import { runConfiguredUpdateCommand } from './command';
import { httpsPublicServer, verifiedHttpsServer } from './public-server';
import { findUpdateSource } from './update-source';

const git = promisify(execFile);

async function pushTarget(context: Pick<ExtensionContext, 'layout'>): Promise<PushTarget> {
  const source = findUpdateSource(context.layout);
  if (source === undefined)
    throw new ApiError('conflict', 'This hub has no update source configured.');
  const { stdout } = await git('git', ['remote', 'get-url', source.remote], {
    cwd: source.checkout,
  });
  const repository = repositoryOf(stdout);
  if (repository === undefined)
    throw new ApiError('conflict', 'The configured update remote is not a GitHub repository.');
  return { repository, branch: source.branch };
}

function baseOf(revisions: readonly UpdateRevision[], tip: string): string | null {
  return revisions.findLast((entry) => entry.status === 'done' && entry.tip !== tip)?.tip ?? null;
}

function failurePayload(failure: UpdateRevision['failure']): {
  readonly component: string | null;
  readonly reason: string | null;
  readonly rollback: string;
} {
  return {
    component: failure?.component ?? null,
    reason: failure?.message ?? null,
    rollback: failure?.rollback ?? 'none',
  };
}

function reportFinished(log: Logger, revision: UpdateRevision): void {
  const { id, tip, status } = revision;
  const payload = { revisionId: id, tip, ...failurePayload(revision.failure) };
  if (status === 'done') log.info('update_pipeline.done', payload);
  else if (status === 'failed')
    log.error(
      'update_pipeline.failed',
      new Error(payload.reason ?? 'The release failed.'),
      payload,
    );
  else log.warn(`update_pipeline.${status}`, payload);
}

async function prepare(
  context: Pick<ExtensionContext, 'layout'>,
  record: RevisionRecord,
  revision: UpdateRevision,
): Promise<Prepared> {
  const { layout } = context;
  const request = {
    tip: revision.tip,
    pushedFrom: revision.pushedFrom,
    base: baseOf(await record.list(), revision.tip),
  };
  const reply = await whenIdle(
    () => untilIdle(layout),
    () => runConfiguredUpdateCommand('self-update-push-plan-command.ts', layout, request),
  );
  const plan = PLAN_RESULT.parse(reply);
  if (plan.status !== 'planned') throw new PipelineRefusal(plan.status, plan.message);
  return plan;
}

function ports(context: ExtensionContext, record: RevisionRecord, watch: ReleaseWatch): QueuePorts {
  const { layout, live, log, store } = context;
  const deps: StepDependencies = {
    layout,
    publicServer: (): string => httpsPublicServer(store.settings.read()),
    finished: (runId: string): Promise<HubUpdateRelease> => watch.finished(runId),
  };
  return {
    record,
    now: (): Date => new Date(),
    newId: randomUUID,
    prepare: (revision): Promise<Prepared> => prepare(context, record, revision),
    execute: (revision, step): Promise<StepOutcome> =>
      step.component === 'hub'
        ? executeHub(deps, revision, step)
        : executePublication(deps, revision, step),
    changed: (revision): void => {
      live.announce({ type: 'hub_update_status_changed' }, 'owners');
      if (revision.finishedAt !== null) reportFinished(log, revision);
    },
    crashed: (cause): void => {
      log.error('update_pipeline.crashed', cause);
    },
  };
}

async function pushSetup(
  context: Pick<ExtensionContext, 'store'>,
  secretFile: string,
): Promise<UpdatePushSetup> {
  const server = verifiedHttpsServer(context.store.settings.read());
  return {
    secretConfigured: (await readPushSecret(secretFile)) !== null,
    webhookUrl: server === null ? null : new URL(UPDATE_PUSH_PATH, server).toString(),
  };
}

export function updatePipelineExtension(): ServerExtension {
  return async (context): Promise<RunningExtension> => {
    const { layout, log } = context;
    const record = RevisionRecord.of(layout);
    const watch = new ReleaseWatch(layout, (cause) => {
      log.error('update_pipeline.watch_failed', cause);
    });
    await watch.start();
    const queue = new ReleaseQueue(ports(context, record, watch));
    queue.resume();
    const secretFile = join(layout.system.updates.selfUpdate, UPDATE_PUSH_SECRET_FILE);
    return {
      endpoints: {
        readUpdateRevisions: bound(E.readUpdateRevisions, async () => ({
          revisions: [...(await record.list())].reverse(),
          push: await pushSetup(context, secretFile),
        })),
      },
      routes: [
        updatePushRoute({
          secret: () => readPushSecret(secretFile),
          target: () => pushTarget(context),
          submit: async (push) => (await queue.submit(push)).id,
        }),
      ],
      stop: async (): Promise<void> => {
        await watch.stop();
      },
    };
  };
}
