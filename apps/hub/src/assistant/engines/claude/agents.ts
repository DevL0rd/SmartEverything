import { z } from 'zod';
import type { AiChatRow, AiAgentRun } from '@smarteverything/domain';
import type { ComputerRunnerDeps } from '../computer/ports';
import type { ComputerEvent } from '../computer/provider-state';
import { agentProjection } from '../../coordination/agent-projection';
import {
  CLAUDE_AGENT_TASK,
  CLAUDE_AGENT_ENVELOPE,
  isAgentTask,
  taskState,
  taskUsage,
  taskError,
  TERMINAL_AGENT_STATES,
  type ClaudeAgentTask,
} from './agent-task';
export function claudeAgents(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  event: ComputerEvent,
): void {
  if (event.kind !== 'runtime' || chat.engine.kind !== 'claude') return;
  const envelope = CLAUDE_AGENT_ENVELOPE.safeParse(event.payload);
  if (!envelope.success) return;
  const subtype = event.payload['subtype'];
  const candidates =
    subtype === 'background_tasks_changed'
      ? z.array(CLAUDE_AGENT_TASK).safeParse(event.payload['tasks'])
      : z.array(CLAUDE_AGENT_TASK).safeParse([event.payload]);
  if (!candidates.success) return;
  for (const task of candidates.data) {
    const base = {
      ...agentProjection(
        chat,
        'claude',
        JSON.stringify([task.task_id, task.run_id ?? null]),
        deps.now().toISOString(),
      ),
      runtime: 'claude' as const,
      device_id: chat.engine.device_id,
      session_id: envelope.data.session_id,
      source_generation: envelope.data._source_generation,
      cwd: envelope.data._source_cwd,
    };
    const previous = deps.store.aiAgentRuns.bySource(base);
    if (!isAgentTask(task, previous)) continue;
    deps.store.aiAgentRuns.upsert(
      projectTask(previous ?? base, task, {
        jobId: event.job_id,
        seq: envelope.data._source_sequence,
        subtype,
        now: deps.now().toISOString(),
      }),
    );
  }
}
function projectTask(
  old: AiAgentRun,
  task: ClaudeAgentTask,
  source: {
    readonly jobId: string;
    readonly seq: number;
    readonly subtype: unknown;
    readonly now: string;
  },
): AiAgentRun {
  const state = taskState(task.patch?.status ?? task.status, old.state, source.subtype);
  const completedAt = TERMINAL_AGENT_STATES.has(state) ? (old.completed_at ?? source.now) : null;
  return {
    ...old,
    job_id: source.jobId,
    source_seq: source.seq,
    ...taskText(old, task),
    state,
    result: taskResult(old, task, state),
    error: taskError(task, state, old.error),
    usage: taskUsage(task, old.usage),
    started_at: old.started_at ?? source.now,
    updated_at: source.now,
    completed_at: completedAt,
    supported_actions: state === 'running' || state === 'waiting' ? ['interrupt'] : [],
  };
}

function taskText(
  old: AiAgentRun,
  task: ClaudeAgentTask,
): Pick<AiAgentRun, 'title' | 'task' | 'progress'> {
  return {
    title: (task.description ?? task.patch?.description ?? old.title).slice(0, 500),
    task: task.prompt?.slice(0, 200_000) ?? old.task,
    progress: task.summary?.slice(0, 16_000) ?? old.progress,
  };
}

function taskResult(
  old: AiAgentRun,
  task: ClaudeAgentTask,
  state: AiAgentRun['state'],
): string | null {
  return state === 'completed' ? (task.summary?.slice(0, 200_000) ?? old.result) : old.result;
}
