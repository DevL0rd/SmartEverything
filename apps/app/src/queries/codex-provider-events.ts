import type { AiChatRuntimeProvider, CodexProviderEvent } from '@smarteverything/domain';
import { CODEX_PROVIDER_METADATA } from '@smarteverything/domain';
import { z } from 'zod';

export type CodexChatProvider = Extract<AiChatRuntimeProvider, { readonly runtime: 'codex' }>;
export function codexProviderKey(chatId: string): readonly string[] {
  return ['window', 'ai-provider', chatId, 'codex-state'];
}
export function withCodexProviderEvent(
  state: CodexChatProvider,
  event: CodexProviderEvent,
): CodexChatProvider {
  if (
    state.job_id !== event.job_id ||
    state.events.some((previous) => previous.job_id === event.job_id && previous.seq >= event.seq)
  )
    return state;
  const base = { ...withCodexPrompt(state, event), events: [...state.events, event].slice(-200) };
  if (event.kind === 'accepted')
    return { ...base, session_id: event.session_id, state: 'working', reason: null };
  if (event.kind === 'context') return { ...base, context: event.context };
  if (event.kind === 'work_item') return withCatalogueMetadata(base, event);
  if (event.kind === 'lifecycle') return { ...base, state: event.state, reason: event.reason };
  if (event.kind === 'completed')
    return {
      ...base,
      state: event.interrupted ? 'interrupted' : 'completed',
      session_id: event.session_id,
    };
  if (event.kind === 'failed') return { ...base, state: 'failed', reason: event.message };
  return base;
}

function withCodexPrompt(state: CodexChatProvider, event: CodexProviderEvent): CodexChatProvider {
  const terminal = event.kind === 'completed' || event.kind === 'failed';
  const base = {
    ...state,
    prompts: terminal
      ? state.prompts.map((prompt) =>
          prompt.status === 'pending' ? { ...prompt, status: 'expired' as const } : prompt,
        )
      : state.prompts,
  };
  if (event.kind === 'prompt')
    return {
      ...base,
      prompts: [...base.prompts.filter((prompt) => prompt.id !== event.prompt.id), event.prompt],
    };
  if (event.kind === 'prompt_resolved')
    return {
      ...base,
      prompts: base.prompts.map((prompt) =>
        prompt.id === event.prompt_id ? { ...prompt, status: 'answered' as const } : prompt,
      ),
    };
  return base;
}

function withCatalogueMetadata(
  state: CodexChatProvider,
  event: Extract<CodexProviderEvent, { readonly kind: 'work_item' }>,
): CodexChatProvider {
  if (event.type !== 'nativeSkillCatalogue') return state;
  const metadata = CODEX_PROVIDER_METADATA.parse(event.payload['metadata']);
  z.string().min(1).max(200).parse(metadata.initialization['command_catalogue_revision']);
  return { ...state, metadata };
}
