import { z } from 'zod';
import type { AiAgentRun, AiAgentState } from '@smarteverything/domain';
export const CLAUDE_AGENT_TASK = z.object({
  task_id: z.string().min(1),
  run_id: z.string().optional(),
  task_type: z.string().optional(),
  subagent_type: z.string().optional(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  parent_task_id: z.string().optional(),
  ambient: z.boolean().optional(),
  skip_transcript: z.boolean().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  patch: z
    .object({
      status: z.string().optional(),
      description: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
  usage: z
    .object({
      total_tokens: z.int().nonnegative(),
      tool_uses: z.int().nonnegative(),
      duration_ms: z.int().nonnegative(),
    })
    .optional(),
});
export type ClaudeAgentTask = z.infer<typeof CLAUDE_AGENT_TASK>;
export const CLAUDE_AGENT_ENVELOPE = z.object({
  session_id: z.string().min(1),
  _source_generation: z.uuid(),
  _source_cwd: z.string(),
  _source_sequence: z.int().positive(),
});
export function isAgentTask(task: ClaudeAgentTask, previous: AiAgentRun | undefined): boolean {
  if (task.ambient === true || task.skip_transcript === true) return false;
  if (task.task_type !== undefined) return task.task_type === 'local_agent';
  return previous !== undefined || task.subagent_type !== undefined;
}
export function taskState(
  status: string | undefined,
  previous: AiAgentState,
  subtype: unknown,
): AiAgentState {
  if (status === undefined) return unreportedTaskState(subtype, previous);
  switch (status) {
    case 'pending':
      return 'queued';
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'killed':
    case 'stopped':
      return 'stopped';
    case 'paused':
      return 'waiting';
    default:
      return previous;
  }
}
export function taskUsage(
  task: ClaudeAgentTask,
  previous: AiAgentRun['usage'],
): AiAgentRun['usage'] {
  if (task.usage === undefined) return previous;
  return {
    input_tokens: null,
    output_tokens: null,
    total_tokens: task.usage.total_tokens,
    cost_usd: null,
    duration_ms: task.usage.duration_ms,
    tool_uses: task.usage.tool_uses,
  };
}
export function taskError(
  task: ClaudeAgentTask,
  state: AiAgentState,
  previous: string | null,
): string | null {
  if (task.patch?.error !== undefined) return task.patch.error.slice(0, 16_000);
  return state === 'failed' ? (task.summary?.slice(0, 16_000) ?? previous) : previous;
}
export const TERMINAL_AGENT_STATES: ReadonlySet<AiAgentState> = new Set([
  'completed',
  'failed',
  'stopped',
  'interrupted',
]);

function unreportedTaskState(subtype: unknown, previous: AiAgentState): AiAgentState {
  return subtype === 'task_started' || subtype === 'background_tasks_changed'
    ? 'running'
    : previous;
}
