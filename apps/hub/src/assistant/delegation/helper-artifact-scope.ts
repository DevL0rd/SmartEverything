import { ApiError, type AiChatRow } from '@smarteverything/domain';
import { switchedOffTools } from '../../ai-tools/tool-discovery';
import { profileIdOf, type Caller } from '../../server/auth';
import { effectiveClientById } from '../../server/person-access';
import { assertToolArea } from '../../server/person-scope';
import { currentRequestSignal } from '../../server/request-signal';
import type { ConversationAuthority } from '../../harness/authority-contract';
import { writerIdentity } from '../../store/repositories/dsh-session-claims';
import type { Store } from '../../store/store';
import { currentProviderToolAuthority } from '../engines/computer/tool-authority';
import { admitChatExecution } from '../native-helpers';
import { admitExecutionTool, currentExecutionAuthority, executionRole } from '../turn-authority';

const POST_TOOL = 'chat_post';

interface Pair {
  readonly helper: AiChatRow;
  readonly parent: AiChatRow;
  readonly helperName: string;
}

function directPair(store: Store, chatId: string, profile: string): Pair {
  const helper = store.aiChats.chat(chatId);
  if (
    helper.profile_id !== profile ||
    helper.kind !== 'subagent' ||
    helper.parent_id === null ||
    helper.helper_name === null
  )
    throw new ApiError('forbidden', 'Only a named helper can share with its direct parent.');
  const parent = store.aiChats.chat(helper.parent_id);
  if (parent.profile_id !== profile)
    throw new ApiError('forbidden', 'The helper’s parent belongs to another profile.');
  for (const chat of [helper, parent]) {
    store.aiChats.assertWorkAllowed(chat.id);
    admitChatExecution(chat);
  }
  return { helper, parent, helperName: helper.helper_name };
}

function dshWriterOf(store: Store, helper: AiChatRow, eventId: string): string {
  const engine = helper.engine;
  if (engine.kind !== 'dsh' || engine.session_id === null)
    throw new ApiError('forbidden', 'The helper has no admitted SmartEverything session.');
  const grant = store.harnessSessions.grant(engine.session_id);
  const claim = store.dshSessions.attached(engine.session_id, helper.profile_id);
  if (claim === null || grant?.event_id !== eventId)
    throw new ApiError('forbidden', 'The helper’s SmartEverything tool grant is no longer active.');
  return writerIdentity(claim);
}

export interface HelperArtifactScope {
  readonly pair: Pair;
  readonly validate: () => Pair;
}

function initiatingHelper(caller: Caller): {
  readonly chatId: string;
  readonly authority: ConversationAuthority;
} {
  if (
    caller.kind === 'anonymous' ||
    (caller.kind === 'client' && (caller.via !== 'assistant' || caller.mcpOrigin !== undefined)) ||
    caller.pluginRequester === 'unlisted'
  )
    throw new ApiError('forbidden', 'Sharing with a parent requires an admitted helper chat.');
  const authority = caller.authority;
  const chatId = caller.chatId;
  if (
    authority === undefined ||
    chatId === undefined ||
    chatId === null ||
    authority.requester === 'unlisted'
  )
    throw new ApiError('forbidden', 'Sharing with a parent requires an admitted helper chat.');
  return { authority, chatId };
}

export function helperArtifactScope(store: Store, caller: Caller): HelperArtifactScope {
  const { authority, chatId } = initiatingHelper(caller);
  const profile = profileIdOf(store, caller);
  const event = store.assistantEvents.event(authority.event_id);
  if (authority.profile_id !== profile || event.profile_id !== profile || event.chat_id !== chatId)
    throw new ApiError('forbidden', 'The initiating grant belongs to another conversation.');
  const pair = directPair(store, chatId, profile);
  const checkRuntime = runtimeScope(store, pair.helper, authority.event_id);
  const signal = currentRequestSignal();
  const validate = (): Pair => {
    signal?.throwIfAborted();
    validateInitiator(store, authority);
    assertToolArea(store, caller, 'assistant');
    admitExecutionTool(store, POST_TOOL, authority);
    if (switchedOffTools(store.settings.read().mcp_disabled_tools).has(POST_TOOL))
      throw new ApiError('forbidden', 'The home has turned off chat_post.');
    const current = directPair(store, chatId, profile);
    if (current.parent.id !== pair.parent.id)
      throw new ApiError('conflict', 'The helper’s parent changed while preparing the post.');
    checkRuntime(current.helper);
    return current;
  };
  validate();
  return { pair, validate };
}

function validateInitiator(store: Store, authority: ConversationAuthority): void {
  if (authority.client_id === null) return;
  const client = effectiveClientById(store, authority.client_id);
  if (
    store.profiles.activeOf(client.id).id !== authority.profile_id ||
    (executionRole(authority) === 'owner' && client.role !== 'owner')
  )
    throw new ApiError('forbidden', 'The initiating app no longer has its original chat access.');
}

function runtimeScope(
  store: Store,
  helper: AiChatRow,
  eventId: string,
): (current: AiChatRow) => void {
  if (helper.engine.kind === 'dsh') {
    const writer = dshWriterOf(store, helper, eventId);
    return (current): void => {
      if (dshWriterOf(store, current, eventId) !== writer)
        throw new ApiError('forbidden', 'The helper’s SmartEverything session moved.');
    };
  }
  const native = currentProviderToolAuthority();
  if (native === undefined || currentExecutionAuthority()?.event_id !== eventId)
    throw new ApiError('forbidden', 'The helper has no current native provider tool grant.');
  return (): void => {
    native.validate(false);
  };
}
