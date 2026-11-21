import { randomUUID } from 'node:crypto';
import type { AiAgentRun, AiChatRow } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import { interruptionCode } from '../interruption';

export function blankAgentRun(
  chat: AiChatRow,
  source: AiAgentRun['source'],
  sourceId: string,
  now: string,
): AiAgentRun {
  return {
    id: randomUUID(),
    parent_chat_id: chat.id,
    profile_id: chat.profile_id,
    source,
    source_id: sourceId,
    parent_run_id: null,
    child_chat_id: null,
    device_id: null,
    runtime: null,
    session_id: null,
    job_id: null,
    source_generation: null,
    source_seq: 0,
    source_revision: 0,
    title: 'Subagent',
    task: null,
    state: 'queued',
    last_known_state: null,
    observability_reason: null,
    progress: null,
    result: null,
    error: null,
    model: null,
    effort: null,
    cwd: null,
    started_at: null,
    updated_at: now,
    completed_at: null,
    usage: null,
    supported_actions: [],
    truncated: false,
  };
}

export class RunRows {
  constructor(
    private readonly store: Store,
    private readonly now: () => Date,
  ) {}

  queued(parent: AiChatRow, child: AiChatRow, eventId: string, task: string): Promise<void> {
    return this.store.host.write('agentRunQueued', {
      parent,
      child,
      eventId,
      task,
      now: this.now().toISOString(),
    });
  }

  started(event: StoredEvent): Promise<void> {
    return this.update(event, 'running', null, null);
  }

  finished(event: StoredEvent, text: string, ok: boolean): Promise<void> {
    const state = ok ? 'completed' : interruptionCode(text) !== null ? 'interrupted' : 'failed';
    return this.update(event, state, text, ok ? null : text);
  }

  restart(): Promise<void> {
    return this.store.host.write('agentRunsRestart', {
      now: this.now().toISOString(),
      error: 'The hub restarted; work was not replayed.',
    });
  }

  private update(
    event: StoredEvent,
    state: AiAgentRun['state'],
    result: string | null,
    error: string | null,
  ): Promise<void> {
    return this.store.host.write('agentRunUpdate', {
      eventId: event.id,
      state,
      result,
      error,
      now: this.now().toISOString(),
    });
  }
}
