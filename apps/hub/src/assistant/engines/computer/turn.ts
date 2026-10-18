import { effectiveTools } from '../../coordination/grants';
import { effectiveClientById, hasOwnerDevice } from '../../../server/person-access';
import { computerEngine } from '../../engine-kind';
import { randomUUID } from 'node:crypto';
import { ApiError, type AiChatRow } from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import { TurnStream } from '../../conversation/stream';
import { eventAuthority } from '../../turn-authority';
import { turnCaller } from '../../conversation/turn-caller';
import { ProviderReplies } from './replies';
import { providerGrant } from './tool-bridge';
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

function ownsNativeWork(store: ComputerRunnerDeps['store'], caller: Turn['caller']): boolean {
  return (
    caller.clientId !== null ||
    caller.pluginRequester !== undefined ||
    hasOwnerDevice(store, caller.profileId)
  );
}

function grantOf(deps: ComputerRunnerDeps, chat: AiChatRow): Turn['grant'] {
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
