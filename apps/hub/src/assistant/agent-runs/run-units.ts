import type { AiAgentRun, AiChatRow } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { computerEngine } from '../engine-kind';
import { blankAgentRun } from './run-rows';

const RESULT_MAX = 200_000;
const ERROR_MAX = 16_000;

export interface QueuedRun {
  readonly parent: AiChatRow;
  readonly child: AiChatRow;
  readonly eventId: string;
  readonly task: string;
  readonly now: string;
}

function engineProjection(
  store: HostStore,
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

export function queuedRun(store: HostStore, input: QueuedRun): void {
  const engine = input.child.engine;
  store.aiAgentRuns.upsert({
    ...blankAgentRun(input.parent, 'smarteverything', input.eventId, input.now),
    id: input.eventId,
    child_chat_id: input.child.id,
    title: input.child.title,
    task: input.task,
    source_seq: 1,
    model: engine.model,
    effort: engine.effort,
    ...engineProjection(store, input.child),
    supported_actions: ['open_chat'],
  });
}

export interface RunUpdate {
  readonly eventId: string;
  readonly state: AiAgentRun['state'];
  readonly result: string | null;
  readonly error: string | null;
  readonly now: string;
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

function updatedRun(store: HostStore, input: RunUpdate): void {
  const run = store.aiAgentRuns.find(input.eventId);
  if (run?.source !== 'smarteverything') return;
  const { state, now } = input;
  store.aiAgentRuns.upsert({
    ...run,
    state,
    ...resultProjection(run, input.result, input.error),
    updated_at: now,
    started_at: run.started_at ?? now,
    completed_at: state === 'running' ? null : now,
    source_seq: run.source_seq + 1,
    supported_actions: state === 'running' ? ['open_chat', 'interrupt'] : ['open_chat', 'delete'],
  });
}

function restartedRuns(
  store: HostStore,
  input: { readonly now: string; readonly error: string },
): void {
  store.write(() => {
    for (const event of store.assistantEvents.abandoned())
      updatedRun(store, {
        eventId: event.id,
        state: 'interrupted',
        result: null,
        error: input.error,
        now: input.now,
      });
  });
}

export const RUN_QUEUED_UNIT = storeUnit(queuedRun);
export const RUN_UPDATE_UNIT = storeUnit(updatedRun);
export const RUN_RESTART_UNIT = storeUnit(restartedRuns);
