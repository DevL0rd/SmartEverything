import type { AiChatProvider, ClaudePrompt, ProviderEvent } from '@smarteverything/domain';
import { JSON_VALUE } from '@smarteverything/domain';
import { z } from 'zod';

const KEPT_EVENTS = 200;

function promptStatus(state: ClaudePrompt['state']): AiChatProvider['prompts'][number]['status'] {
  if (state === 'waiting') return 'pending';
  if (state === 'expired' || state === 'taken_over') return 'expired';
  return 'answered';
}

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
    status: promptStatus(event.prompt.state),
  };
}

function withPrompt(state: AiChatProvider, event: ProviderEvent): AiChatProvider {
  const prompt = promptOf(event);
  const terminal = event.kind === 'completed' || event.kind === 'failed';
  const prompts = terminal
    ? state.prompts.map((item) =>
        item.status === 'pending' ? { ...item, status: 'expired' as const } : item,
      )
    : state.prompts;
  return {
    ...state,
    prompts:
      prompt === null ? prompts : [...prompts.filter((item) => item.id !== prompt.id), prompt],
  };
}

export function providerSequence(state: AiChatProvider, jobId: string): number {
  return state.events.reduce(
    (seq, event) => (event.job_id === jobId ? Math.max(seq, event.seq) : seq),
    0,
  );
}

export function withProviderEvent(state: AiChatProvider, event: ProviderEvent): AiChatProvider {
  if (state.job_id !== event.job_id || event.seq <= providerSequence(state, event.job_id))
    return state;
  const base = {
    ...withPrompt(state, event),
    events: [...state.events, event].slice(-KEPT_EVENTS),
  };
  if (event.kind === 'accepted')
    return { ...base, session_id: event.session_id, state: 'working', reason: null };
  if (event.kind === 'completed')
    return { ...base, session_id: event.session_id, state: 'completed' };
  if (event.kind === 'failed')
    return { ...base, state: 'failed', job_id: null, reason: event.message };
  return base;
}
