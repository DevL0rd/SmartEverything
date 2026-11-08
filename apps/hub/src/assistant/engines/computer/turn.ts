import { effectiveTools } from '../../tool-scope';
import { effectiveClientById, hasOwnerDevice } from '../../../server/person-access';
import { computerEngine, type ComputerEngine } from '../../engine-kind';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  ApiError,
  CLAUDE_PROVIDER_OPTIONS,
  CODEX_PROVIDER_OPTIONS,
  type AiChatRow,
  type ComputerRuntimeProviderTurn,
} from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import { TurnStream } from '../../conversation/stream';
import { assertHelperDelivery, helperParentMessageId } from '../../delegation/helper-dialogue';
import { admitExecutionTarget, eventAuthority, executionRole } from '../../turn-authority';
import { turnCaller } from '../../conversation/turn-caller';
import { ProviderReplies } from './replies';
import { providerGrant } from './tool-bridge';
import { effectiveProviderEngine } from './options';
import type { ComputerRunnerDeps, Turn } from './runner';

export function openProviderTurn(
  deps: ComputerRunnerDeps,
  event: StoredEvent,
  chat: AiChatRow,
): Turn {
  const engine = computerEngine(chat.engine);
  if (engine === null) throw new ApiError('conflict', 'The provider binding changed.');
  const bound = { ...chat, engine };
  const { store } = deps;
  const caller = {
    ...turnCaller({
      chat,
      event,
      latest: event.message_id === null ? null : store.assistantChat.message(event.message_id),
      client: event.client_id === null ? undefined : effectiveClientById(store, event.client_id),
    }),
    authority: eventAuthority(store, event),
  };
  if (caller.role !== 'owner' || !ownsNativeWork(store, caller))
    throw new ApiError('forbidden', 'Only the home owner can use Claude or Codex on computers.');
  let finish = (): void => {
    return;
  };
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const { stream, replies } = providerOutput(deps, event, bound);
  const grant = grantOf(deps, chat);
  deps.conversation.stateOf(event.message_id, 'working');
  stream.snapshot('thinking', null, null);
  return {
    jobId: randomUUID(),
    event,
    chat: bound,
    executionEngine: null,
    replies,
    stream,
    grant,
    caller,
    done,
    finish,
    calls: new Set<string>(),
    steered: [],
  };
}

export function assertProviderHelperDelivery(
  deps: ComputerRunnerDeps,
  turn: Turn,
  prepared?: ComputerRuntimeProviderTurn,
): void {
  if (helperParentMessageId(turn.event) === null) return;
  const { store } = deps;
  const current = store.aiChats.chat(turn.chat.id);
  if (JSON.stringify(current.engine) !== JSON.stringify(turn.chat.engine))
    throw new ApiError(
      'conflict',
      'The helper’s provider binding changed before it could accept the message.',
    );
  assertHelperDelivery(store, current, turn.event);
  const authority = eventAuthority(store, turn.event);
  admitExecutionTarget(store, current, authority);
  if (executionRole(authority) !== 'owner')
    throw new ApiError('forbidden', 'Only the home owner can start work with this helper.');
  const grant = grantOf(deps, current);
  if (
    !isDeepStrictEqual(grant.names, turn.grant.names) ||
    !isDeepStrictEqual(grant.tools, turn.grant.tools)
  )
    throw new ApiError(
      'forbidden',
      'The helper’s tool access changed before it could accept the message.',
    );
  if (prepared !== undefined) assertPreparedOptions(deps, turn.chat.engine, prepared);
}

function assertPreparedOptions(
  deps: ComputerRunnerDeps,
  engine: ComputerEngine,
  prepared: ComputerRuntimeProviderTurn,
): void {
  const status = deps.directory.runtimeStatus({
    device_id: engine.device_id,
    runtime: engine.kind,
  });
  if (!status.online || !status.settings.settings.provider.enabled)
    throw new ApiError(
      'conflict',
      'The helper’s provider became unavailable before accepting the message.',
    );
  const { settings } = effectiveProviderEngine(engine, status.settings);
  const options =
    prepared.runtime === 'claude'
      ? CLAUDE_PROVIDER_OPTIONS.parse(settings)
      : CODEX_PROVIDER_OPTIONS.parse(settings);
  if (!isDeepStrictEqual(options, prepared.turn.options))
    throw new ApiError(
      'conflict',
      'The helper’s machine settings changed before it could accept the message.',
    );
}

function ownsNativeWork(store: ComputerRunnerDeps['store'], caller: Turn['caller']): boolean {
  return (
    caller.clientId !== null ||
    caller.pluginRequester !== undefined ||
    hasOwnerDevice(store, caller.profileId)
  );
}

export function grantOf(deps: ComputerRunnerDeps, chat: AiChatRow): Turn['grant'] {
  const allowed = effectiveTools(deps.store, chat);
  return providerGrant(deps.tools(), { ...chat, tools: allowed === null ? null : [...allowed] });
}

function providerOutput(
  deps: ComputerRunnerDeps,
  event: StoredEvent,
  bound: Turn['chat'],
): Pick<Turn, 'stream' | 'replies'> {
  const stream = new TurnStream(
    {
      chatId: bound.id,
      turnId: event.id,
      messageId: event.message_id,
      profileId: bound.profile_id,
    },
    deps.emit,
  );
  const replies = new ProviderReplies(
    deps.conversation,
    bound,
    event.message_id,
    bound.engine.model,
  );
  stream.bindTimeline((timeline): void => {
    replies.timeline(timeline);
  });
  return { stream, replies };
}
