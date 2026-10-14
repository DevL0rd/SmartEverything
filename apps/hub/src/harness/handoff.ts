import { setTimeout } from 'node:timers/promises';
import { Logger } from '@smarteverything/logging';
import type { HandoffResumeContext } from './handoff-context';
import { recoverFailedTarget } from './handoff-recovery';
import { handoffAttachments } from './handoff-attachments';
import { randomUUID } from 'node:crypto';
import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type {
  AiHarnessSession,
  AiHarnessHandoff,
  AiHarnessHandoffRequest,
} from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import { requireSessionComposition } from '../store/repositories/dsh-session-claims';
import type { HarnessService } from './service';
import { prepareConversation } from './preparation';
const log = new Logger('hub.harness');
const MAX_LEASE_WAIT_MS = 125_000;
interface Move {
  readonly owner: ChatOwner;
  readonly session: AiHarnessSession;
  readonly input: AiHarnessHandoffRequest;
  readonly handoff: AiHarnessHandoff;
  readonly snapshot: HandoffResumeContext;
}
export async function moveConversation(
  service: HarnessService,
  move: Move,
): Promise<AiHarnessHandoff> {
  let handoff = move.handoff;
  const originalChat = move.snapshot.chat;
  const sourceGrant = move.snapshot.grant;
  const progress = (update: Partial<AiHarnessHandoff>): void => {
    handoff = { ...handoff, ...update, updated_at: new Date().toISOString() };
    service.store.harnessCoordination.handoff(handoff);
  };
  try {
    const cwd = await preflight(service, move);
    if (handoff.source_outcome === 'pending') {
      const outcome = await closeSource(service, { ...move, handoff }, progress);
      progress({ stage: 'acquiring', source_outcome: outcome });
    }
    await acquireTarget(service, move, cwd, progress);
    const metadata = service.store.dshSessions.stat(move.session.session_id, move.owner.profileId);
    if (metadata === undefined)
      throw new ApiError('conflict', 'Native handoff metadata disappeared.');
    progress({ stage: 'completed', waiting: [], durable_seq: metadata.durable_seq });
    service.store.harnessCoordination.finish(move.input.operation_id, handoff);
    return handoff;
  } catch (cause) {
    log.error('handoff.failed', cause, {
      operation_id: move.input.operation_id,
      stage: handoff.stage,
    });
    const recovery = await failedTargetRecovery(service, {
      chat: originalChat,
      grant: sourceGrant,
      handoff,
    });
    progress(failedHandoff(handoff, cause, recovery));
    service.store.harnessCoordination.finish(move.input.operation_id, handoff, 'unknown');
    return handoff;
  }
}
function failedHandoff(
  handoff: AiHarnessHandoff,
  cause: unknown,
  recovery: string | null,
): Partial<AiHarnessHandoff> {
  return {
    stage: 'failed',
    source_outcome:
      handoff.stage === 'preflight'
        ? 'pending'
        : handoff.source_outcome === 'closed'
          ? 'closed'
          : 'unknown',
    failure: {
      code: handoff.stage === 'preflight' ? 'operation_failed' : 'source_outcome_unknown',
      message:
        cause instanceof Error
          ? [cause.message, recovery]
              .filter((value) => value !== null)
              .join(' ')
              .slice(0, 2000)
          : 'Native handoff outcome is unconfirmed.',
      retry_at: null,
    },
  };
}
async function failedTargetRecovery(
  service: HarnessService,
  input: Parameters<typeof recoverFailedTarget>[1],
): Promise<string | null> {
  if (input.handoff.source_outcome !== 'closed') return null;
  try {
    await recoverFailedTarget(service, input);
    return 'The original source was reopened with a new fenced writer epoch.';
  } catch (cause) {
    log.error('handoff.recovery_failed', cause, { operation_id: input.handoff.id });
    return cause instanceof Error ? cause.message : 'Failed-target recovery outcome is unknown.';
  }
}
async function acquireTarget(
  service: HarnessService,
  move: Move,
  cwd: string,
  progress: (update: Partial<AiHarnessHandoff>) => void,
): Promise<void> {
  const priorGrant = move.snapshot.grant;
  const chat = service.own(move.owner, move.session.chat_id);
  const binding = service.binding(chat);
  service.store.aiChats.update(chat.id, {
    engine: {
      ...binding,
      execution_target: move.input.target,
      model_route_id: move.input.route.route_id,
      model: move.input.route.model,
      effort: move.input.route.effort,
    },
  });
  const open = prepareConversation(service, {
    owner: move.owner,
    chatId: chat.id,
    authority: priorGrant.authority,
    localClientId: move.snapshot.local_client_id ?? priorGrant.client_id ?? undefined,
    cwd,
    explicitWorkspace: move.input.directory !== undefined,
  });
  progress({ stage: 'resuming', target_epoch: open.claim.epoch });
  await service.directory.execute(move.input.target, randomUUID(), open);
}
async function preflight(service: HarnessService, move: Move): Promise<string> {
  const attachments = handoffAttachments(service, move.session);
  const connection = service.directory.get(move.input.target);
  service.admitTarget(
    move.owner,
    connection.host,
    connection.actor.id,
    move.snapshot.local_client_id,
  );
  if (connection.host.manifest === null)
    throw new ApiError('conflict', 'Target native composition is unavailable.');
  requireSessionComposition(
    move.session.session_id,
    move.session.metadata.composition,
    connection.host.manifest.composition,
  );
  admitManagedTarget(move, connection.host);
  const cwd = targetWorkspace(service, move, connection.host);
  await service.directory.execute(move.input.target, randomUUID(), {
    kind: 'preflight',
    native_attachments: [...attachments],
    session_id: move.session.session_id,
    expected_epoch: move.input.expected_epoch,
    route: move.input.route,
    permission: move.session.permission,
    cwd,
    ...(move.snapshot.grant.storage_binding === undefined
      ? {}
      : { storage_binding: move.snapshot.grant.storage_binding }),
  });
  return cwd;
}
async function closeSource(
  service: HarnessService,
  move: Move,
  progress: (update: Partial<AiHarnessHandoff>) => void,
): Promise<'closed' | 'unknown'> {
  const { session, input } = move;
  if (input.mode === 'recover') return recoverSource(service, move);
  admitSourceRuntime(service, move);
  if (input.mode === 'interrupt' && move.handoff.stage !== 'closing')
    await service.directory.execute(session.target, move.snapshot.controls.interrupt, {
      kind: 'interrupt',
      session_id: session.session_id,
      expected_epoch: input.expected_epoch,
    });
  if (move.handoff.stage !== 'closing') {
    progress({ stage: 'draining' });
    await service.directory.execute(session.target, move.snapshot.controls.drain, {
      kind: 'drain',
      session_id: session.session_id,
      expected_epoch: input.expected_epoch,
      handoff: input,
    });
    progress({ stage: 'closing' });
  }
  const closed = await service.directory.execute(session.target, move.snapshot.controls.close, {
    kind: 'close',
    session_id: session.session_id,
    expected_epoch: input.expected_epoch,
  });
  if (closed.state !== 'closed')
    throw new ApiError(
      'conflict',
      'The source did not confirm native flush, disposal and lease release.',
    );
  return 'closed';
}

async function recoverSource(service: HarnessService, move: Move): Promise<'unknown'> {
  await waitForSourceLease(service, move);
  const { session, input } = move;
  const writer = service.store.dshSessions.writerState(session.session_id, move.owner.profileId);
  if (
    writer.claim?.epoch !== input.expected_epoch ||
    harnessTargetKey(writer.claim.target) !== harnessTargetKey(session.target)
  )
    throw new ApiError('conflict', 'Recovery requires the exact disconnected source writer.');
  if (writer.state === 'active' && Date.parse(writer.claim.expires_at) > Date.now())
    throw new ApiError(
      'conflict',
      'The disconnected source lease has not expired; recovery cannot fence it yet.',
    );
  return 'unknown';
}
async function waitForSourceLease(service: HarnessService, move: Move): Promise<void> {
  const writer = service.store.dshSessions.writerState(
    move.session.session_id,
    move.owner.profileId,
  );
  if (
    writer.claim?.epoch !== move.input.expected_epoch ||
    harnessTargetKey(writer.claim.target) !== harnessTargetKey(move.session.target)
  )
    throw new ApiError('conflict', 'Recovery requires the exact disconnected source writer.');
  if (writer.state !== 'active') return;
  const delay = Math.max(0, Date.parse(writer.claim.expires_at) - Date.now());
  if (delay > MAX_LEASE_WAIT_MS)
    throw new ApiError('conflict', 'The existing writer lease exceeds the safe recovery window.');
  await setTimeout(delay);
}

function admitSourceRuntime(service: HarnessService, move: Move): void {
  const host = service.directory.get(move.session.target).host;
  if (
    host.runtime_instance !== move.snapshot.grant.runtime_instance ||
    host.connection_generation !== move.snapshot.grant.generation
  )
    throw new ApiError(
      'conflict',
      'The source runtime changed before its durable close receipt; outstanding effects are unknown.',
    );
}

function admitManagedTarget(
  move: Move,
  host: ReturnType<HarnessService['directory']['get']>['host'],
): void {
  if (move.snapshot.grant.storage_binding?.kind === 'device' && host.target.kind === 'server')
    throw new ApiError(
      'conflict',
      'The explicit device project has no hub execution mapping. Its device files remain local.',
    );
  if (
    move.snapshot.grant.storage_binding?.kind === 'managed' &&
    host.manifest?.project_files?.protocol !== 1
  )
    throw new ApiError(
      'conflict',
      'The target host cannot preserve the central chat workspace; upgrade its project file capability.',
    );
}

function targetWorkspace(
  service: HarnessService,
  move: Move,
  host: ReturnType<HarnessService['directory']['get']>['host'],
): string {
  const cwd =
    move.input.directory?.path ??
    service.store.dshSessions.workspace(
      move.session.session_id,
      move.input.target,
      move.owner.profileId,
    )?.cwd ??
    host.workspace?.default_directory ??
    host.workspace?.home_directory;
  if (cwd === undefined) throw new ApiError('conflict', 'Target workspace is unresolved.');
  return cwd;
}
