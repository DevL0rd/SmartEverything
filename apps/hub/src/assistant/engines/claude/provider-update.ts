import { z } from 'zod';
import {
  JSON_VALUE,
  type AiChatProvider,
  type ClaudePrompt,
  type ProviderControl,
  type ProviderEvent,
} from '@smarteverything/domain';

function promptOf(event: ProviderEvent): AiChatProvider['prompts'][number] | null {
  if (event.kind === 'dialog')
    return {
      id: event.prompt_id,
      kind: event.dialog_kind,
      request: event.request,
      status: event.status ?? 'pending',
    };
  if (event.kind !== 'prompt') return null;
  return {
    id: event.prompt.id,
    kind: event.prompt.kind,
    request: z.record(z.string(), JSON_VALUE).parse(event.prompt),
    status: nativePromptStatus(event.prompt.state),
  };
}

function nativePromptStatus(
  state: ClaudePrompt['state'],
): AiChatProvider['prompts'][number]['status'] {
  switch (state) {
    case 'waiting':
      return 'pending';
    case 'expired':
    case 'taken_over':
      return 'expired';
    case 'allowed':
    case 'denied':
    case 'answered':
      return 'answered';
  }
}

export function changesMetadata(control: ProviderControl): boolean {
  return (
    control.action === 'set_model' ||
    control.action === 'set_permission_mode' ||
    control.action === 'set_mcp_servers' ||
    control.action === 'apply_flags' ||
    control.action === 'update_settings'
  );
}

export function updatedProvider(state: AiChatProvider, event: ProviderEvent): AiChatProvider {
  const session =
    event.kind === 'accepted' || event.kind === 'completed' ? event.session_id : state.session_id;
  const terminal = event.kind === 'completed' || event.kind === 'failed';
  const prompts = terminal
    ? state.prompts.map((item) =>
        item.status === 'pending' ? { ...item, status: 'expired' as const } : item,
      )
    : state.prompts;
  const prompt = promptOf(event);
  const base = {
    ...state,
    session_id: session,
    prompts:
      prompt === null ? prompts : [...prompts.filter((item) => item.id !== prompt.id), prompt],
  };
  if (event.kind === 'completed') return { ...base, state: 'completed' };
  if (event.kind === 'failed')
    return { ...base, state: 'failed', job_id: null, reason: event.message };
  return base;
}
