import { z } from 'zod';
import {
  CODEX_PROVIDER_METADATA,
  type AiChatRuntimeProvider,
  type CodexProviderEvent,
} from '@smarteverything/domain';
export function updatedCodexProvider(
  state: Extract<AiChatRuntimeProvider, { runtime: 'codex' }>,
  event: CodexProviderEvent,
): Extract<AiChatRuntimeProvider, { runtime: 'codex' }> {
  if (!changesProviderState(event)) return state;
  switch (event.kind) {
    case 'work_item':
      return catalogueMetadata(state, event);
    case 'accepted':
      return { ...state, session_id: event.session_id };
    case 'context':
      return { ...state, context: event.context };
    case 'lifecycle':
      return { ...state, state: event.state, reason: event.reason };
    case 'prompt':
      return {
        ...state,
        prompts: [...state.prompts.filter((item) => item.id !== event.prompt.id), event.prompt],
      };
    case 'prompt_resolved':
      return {
        ...state,
        prompts: state.prompts.map((item) =>
          item.id === event.prompt_id ? { ...item, status: 'answered' } : item,
        ),
      };
    case 'completed':
      return {
        ...state,
        session_id: event.session_id,
        state: completedState(event.interrupted),
        prompts: [],
      };
    case 'failed':
      return {
        ...state,
        state: failedState(event.code),
        reason: event.message,
        prompts: [],
      };
  }
}

type StateEvent = Extract<
  CodexProviderEvent,
  {
    kind:
      | 'work_item'
      | 'accepted'
      | 'context'
      | 'lifecycle'
      | 'prompt'
      | 'prompt_resolved'
      | 'completed'
      | 'failed';
  }
>;
function changesProviderState(event: CodexProviderEvent): event is StateEvent {
  return [
    'work_item',
    'accepted',
    'context',
    'lifecycle',
    'prompt',
    'prompt_resolved',
    'completed',
    'failed',
  ].includes(event.kind);
}

function failedState(code: string): 'unknown' | 'failed' {
  return ['computer_disconnected', 'transport_lost'].includes(code) ? 'unknown' : 'failed';
}

function catalogueMetadata(
  state: Extract<AiChatRuntimeProvider, { runtime: 'codex' }>,
  event: Extract<CodexProviderEvent, { kind: 'work_item' }>,
): Extract<AiChatRuntimeProvider, { runtime: 'codex' }> {
  if (event.type !== 'nativeSkillCatalogue') return state;
  const metadata = CODEX_PROVIDER_METADATA.parse(event.payload['metadata']);
  z.string().min(1).max(200).parse(metadata.initialization['command_catalogue_revision']);
  return { ...state, metadata };
}
function completedState(interrupted: boolean): 'interrupted' | 'completed' {
  return interrupted ? 'interrupted' : 'completed';
}
