import { randomUUID } from 'node:crypto';
import { Logger, messageOf } from '@smarteverything/logging';
import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessHost,
  AiHarnessInteraction,
  AiHarnessPath,
  AiHarnessSession,
  AiHarnessTarget,
  AiModelRouteSelection,
} from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessGrant } from './grant';
import { machineChangeFailedNote, machineChangedNote } from './machine-note';
import { prepareConversation } from './preparation';
import type { HarnessService } from './service';

const log = new Logger('hub.harness');
export interface Move {
  readonly owner: ChatOwner;
  readonly chat: AiChatRow;
  readonly session: AiHarnessSession;
  readonly grant: HarnessGrant;
  readonly target: AiHarnessTarget;
  readonly route: AiModelRouteSelection;
  readonly directory?: AiHarnessPath | undefined;
  readonly interrupt: boolean;
}
export type MoveOutcome =
  | { readonly state: 'moved'; readonly note: string }
  | { readonly state: 'restored'; readonly reason: string; readonly note: string }
  | { readonly state: 'stranded'; readonly reason: string };

export async function moveConversation(service: HarnessService, move: Move): Promise<MoveOutcome> {
  const { session } = move;
  const from = service.directory.registered(session.target).host;
  service.store.harnessCoordination.markSwitching(session.session_id);
  let detached = false;
  let asked: readonly AiHarnessInteraction[] = [];
  try {
    const cwd = targetWorkspace(service, move);
    detached = true;
    asked = await detachSource(service, move);
    const to = await attachTarget(service, move, cwd, asked);
    return { state: 'moved', note: machineChangedNote({ from, to: to.host, cwd: to.cwd }) };
  } catch (cause) {
    const reason = messageOf(cause);
    log.error('machine_move.failed', cause, { chat_id: move.chat.id });
    return settleFailure(service, move, { reason, from, reattach: detached, asked });
  }
}

async function settleFailure(
  service: HarnessService,
  move: Move,
  failure: {
    readonly reason: string;
    readonly from: AiHarnessHost;
    readonly reattach: boolean;
    readonly asked: readonly AiHarnessInteraction[];
  },
): Promise<MoveOutcome> {
  service.store.aiChats.update(move.chat.id, { engine: move.chat.engine });
  try {
    if (failure.reattach) await attachSource(service, move, failure.asked);
    else service.store.harnessCoordination.settleSwitching(move.session.session_id, null);
  } catch (cause) {
    log.error('machine_move.restore_failed', cause, { chat_id: move.chat.id });
    service.store.harnessCoordination.settleSwitching(move.session.session_id, {
      code: 'operation_failed',
      message: failure.reason,
      retry_at: null,
    });
    return { state: 'stranded', reason: failure.reason };
  }
  return {
    state: 'restored',
    reason: failure.reason,
    note: machineChangeFailedNote({
      stay: failure.from,
      wanted: service.directory.registered(move.target).host,
      reason: failure.reason,
    }),
  };
}

async function detachSource(
  service: HarnessService,
  move: Move,
): Promise<readonly AiHarnessInteraction[]> {
  const { session } = move;
  if (session.epoch === null) return [];
  if (!service.directory.holds(session.target, session.session_id, session.epoch)) return [];
  const control = { session_id: session.session_id, expected_epoch: session.epoch };
  const interrupted = move.interrupt
    ? await service.directory.execute(session.target, randomUUID(), {
        kind: 'interrupt',
        ...control,
      })
    : undefined;
  const closed = await service.directory.execute(session.target, randomUUID(), {
    kind: 'close',
    ...control,
  });
  if (closed.state !== 'closed')
    throw new ApiError('conflict', 'The previous machine did not confirm it had stopped.');
  return interrupted?.interactions ?? [];
}

async function attachTarget(
  service: HarnessService,
  move: Move,
  cwd: string,
  asked: readonly AiHarnessInteraction[],
): Promise<{ readonly host: AiHarnessHost; readonly cwd: string }> {
  const binding = service.binding(move.chat);
  service.store.aiChats.update(move.chat.id, {
    engine: {
      ...binding,
      execution_target: move.target,
      model_route_id: move.route.route_id,
      model: move.route.model,
      effort: move.route.effort,
    },
  });
  const open = prepareConversation(service, {
    owner: move.owner,
    chatId: move.chat.id,
    authority: move.grant.authority,
    localClientId: move.grant.client_id ?? undefined,
    cwd,
    interactions: asked,
  });
  await service.directory.execute(move.target, randomUUID(), open);
  return { host: service.directory.get(move.target).host, cwd: open.cwd };
}

async function attachSource(
  service: HarnessService,
  move: Move,
  asked: readonly AiHarnessInteraction[],
): Promise<void> {
  const open = prepareConversation(service, {
    owner: move.owner,
    chatId: move.chat.id,
    authority: move.grant.authority,
    localClientId: move.grant.client_id ?? undefined,
    cwd: move.grant.cwd,
    interactions: asked,
  });
  await service.directory.execute(move.session.target, randomUUID(), open);
}

function targetWorkspace(service: HarnessService, move: Move): string {
  if (move.target.kind === 'server') return service.chatFolder(move.chat.id);
  const host = service.directory.get(move.target).host;
  const cwd =
    move.directory?.path ??
    service.store.dshSessions.workspace(move.session.session_id, move.target, move.owner.profileId)
      ?.cwd ??
    host.workspace?.default_directory ??
    host.workspace?.home_directory;
  if (cwd === undefined)
    throw new ApiError('conflict', 'The target machine has no usable workspace folder.');
  return cwd;
}

export function sameTarget(left: AiHarnessTarget, right: AiHarnessTarget): boolean {
  return harnessTargetKey(left) === harnessTargetKey(right);
}
