import type { AiChatRow, AiAgentRun } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import { agentProjection } from './agent-projection';
export class AgentLifecycle {
  constructor(
    private readonly store: Store,
    private readonly now: () => Date,
  ) {}
  queued(parent: AiChatRow, child: AiChatRow, eventId: string, task: string): void {
    const engine = child.engine;
    this.store.aiAgentRuns.upsert({
      ...agentProjection(parent, 'smarteverything', eventId, this.now().toISOString()),
      id: eventId,
      child_chat_id: child.id,
      title: child.title,
      task,
      source_seq: 1,
      model: engine.model,
      effort: engine.effort,
      ...engineProjection(this.store, child),
      supported_actions: ['open_chat'],
    });
  }
  started(event: StoredEvent): void {
    this.update(event, 'running', null, null);
  }
  finished(event: StoredEvent, text: string, ok: boolean): void {
    const state = ok ? 'completed' : text === 'Stopped.' ? 'interrupted' : 'failed';
    this.update(event, state, text, ok ? null : text);
  }
  restart(): void {
    for (const event of this.store.assistantEvents.abandoned())
      this.update(event, 'interrupted', null, 'The hub restarted; work was not replayed.');
  }
  private update(
    event: StoredEvent,
    state: AiAgentRun['state'],
    result: string | null,
    error: string | null,
  ): void {
    const run = this.store.aiAgentRuns.find(event.id);
    if (run?.source !== 'smarteverything') return;
    const now = this.now().toISOString();
    this.store.aiAgentRuns.upsert({
      ...run,
      state,
      ...resultProjection(run, result, error),
      updated_at: now,
      started_at: run.started_at ?? now,
      completed_at: state === 'running' ? null : now,
      source_seq: run.source_seq + 1,
      supported_actions: state === 'running' ? ['open_chat', 'interrupt'] : ['open_chat'],
    });
  }
}

function resultProjection(
  run: AiAgentRun,
  result: string | null,
  error: string | null,
): Pick<AiAgentRun, 'result' | 'error' | 'truncated'> {
  return {
    result: result?.slice(0, 200_000) ?? run.result,
    error: error?.slice(0, 16_000) ?? null,
    truncated: run.truncated || (result !== null && result.length > 200_000),
  };
}

function engineProjection(
  store: Store,
  child: AiChatRow,
): Pick<AiAgentRun, 'device_id' | 'runtime' | 'cwd'> {
  const engine = child.engine;
  if (engine.kind === 'openrouter') return { device_id: null, runtime: null, cwd: null };
  if (engine.kind !== 'dsh')
    return { device_id: engine.device_id, runtime: engine.kind, cwd: engine.settings.cwd ?? null };
  return {
    device_id: engine.execution_target.kind === 'device' ? engine.execution_target.device_id : null,
    runtime: engine.kind,
    cwd:
      engine.session_id === null
        ? null
        : (store.harnessCoordination.state(engine.session_id)?.directory?.path ?? null),
  };
}
