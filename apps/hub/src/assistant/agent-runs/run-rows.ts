import { randomUUID } from 'node:crypto';
import type { AiAgentRun, AiChatRow } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import { computerEngine } from '../engine-kind';
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

const RESULT_MAX = 200_000;
const ERROR_MAX = 16_000;

export class RunRows {
  constructor(
    private readonly store: Store,
    private readonly now: () => Date,
  ) {}

  queued(parent: AiChatRow, child: AiChatRow, eventId: string, task: string): void {
    const engine = child.engine;
    this.store.aiAgentRuns.upsert({
      ...blankAgentRun(parent, 'smarteverything', eventId, this.now().toISOString()),
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
    const state = ok ? 'completed' : interruptionCode(text) !== null ? 'interrupted' : 'failed';
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
      supported_actions: state === 'running' ? ['open_chat', 'interrupt'] : ['open_chat', 'delete'],
    });
  }
}

function resultProjection(
  run: AiAgentRun,
  result: string | null,
  error: string | null,
): Pick<AiAgentRun, 'result' | 'error' | 'truncated'> {
  return {
    result: result?.slice(0, RESULT_MAX) ?? run.result,
    error: error?.slice(0, ERROR_MAX) ?? null,
    truncated: run.truncated || (result !== null && result.length > RESULT_MAX),
  };
}

function engineProjection(
  store: Store,
  child: AiChatRow,
): Pick<AiAgentRun, 'device_id' | 'runtime' | 'cwd'> {
  const engine = child.engine;
  const computer = computerEngine(engine);
  if (computer !== null)
    return {
      device_id: computer.device_id,
      runtime: computer.kind,
      cwd: computer.settings.cwd ?? null,
    };
  if (engine.kind !== 'dsh') return { device_id: null, runtime: null, cwd: null };
  return {
    device_id: engine.execution_target.kind === 'device' ? engine.execution_target.device_id : null,
    runtime: engine.kind,
    cwd:
      engine.session_id === null
        ? null
        : (store.harnessSessions.state(engine.session_id)?.directory?.path ?? null),
  };
}
