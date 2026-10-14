import {
  turnRoleOf,
  type AiChatRow,
  type AssistantMessageRow,
  type ClientRow,
  type PluginRequester,
} from '@smarteverything/domain';
import type { ToolCaller } from '../../ai-tools/hub-tool';
import { limitsOf } from '../../ai-tools/plugin-turn';
import type { StoredEvent } from '../../store/repositories/assistant-events';

export interface TurnCallerInput {
  readonly chat: AiChatRow;
  readonly event: StoredEvent;
  readonly latest: AssistantMessageRow | null;
  readonly client: ClientRow | undefined;
}

function requesterOf(input: TurnCallerInput): PluginRequester | undefined {
  return (
    input.latest?.origin?.requester ?? (input.event.kind === 'plugin' ? 'unlisted' : undefined)
  );
}

function roleOf(
  input: TurnCallerInput,
  requester: PluginRequester | undefined,
): ToolCaller['role'] {
  return requester === undefined ? (input.client?.role ?? 'owner') : turnRoleOf(requester);
}

export function turnCaller(input: TurnCallerInput): ToolCaller {
  const { chat, event } = input;
  const requester = requesterOf(input);
  return {
    profileId: chat.profile_id,
    role: roleOf(input, requester),
    chatId: chat.id,
    via: event.kind === 'voice' ? 'voice' : 'chat',
    clientId: event.client_id,
    ...limitsOf(requester, input.latest?.origin?.plugin_id),
  };
}
