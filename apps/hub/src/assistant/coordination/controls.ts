import { z } from 'zod';
import type { AI_AGENT_RUN_CONTROL } from '@smarteverything/domain';
import { ApiError, type AiAgentRun, type AiChatRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { ComputerRunner } from '../engines/computer/runner';
import { computerEngine } from '../engine-kind';
export interface AgentControlPorts {
  readonly store: Store;
  readonly interrupt: (chat: AiChatRow) => Promise<void>;
  readonly computer: (runtime: 'claude' | 'codex') => ComputerRunner | undefined;
}
export async function controlAgent(
  ports: AgentControlPorts,
  run: AiAgentRun,
  control: z.infer<typeof AI_AGENT_RUN_CONTROL>,
): Promise<void> {
  if (!run.supported_actions.includes(control.action))
    throw new ApiError('conflict', 'This agent has not advertised that control action.');
  if (run.source === 'smarteverything') return controlOwnAgent(ports, run, control);
  const parent = ports.store.aiChats.chat(run.parent_chat_id);
  const bound = computerEngine(parent.engine);
  if (bound === null)
    throw new ApiError('conflict', 'This run has no native computer provider binding.');
  if (bound.kind !== run.runtime || bound.device_id !== run.device_id)
    throw new ApiError('conflict', 'The parent runtime binding changed.');
  const runner = ports.computer(bound.kind);
  if (runner === undefined) throw new ApiError('conflict', 'This runtime is unavailable.');
  const state = runner.state.bound(parent);
  assertCurrentChild(state, run);
  if (run.source !== 'claude' || control.action !== 'interrupt')
    throw new ApiError('conflict', 'The native adapter does not advertise this child control.');
  const [taskId] = z
    .tuple([z.string().min(1), z.string().nullable()])
    .parse(JSON.parse(run.source_id));
  await runner.control(parent, { action: 'stop_task', task_id: taskId });
}

async function controlOwnAgent(
  ports: AgentControlPorts,
  run: AiAgentRun,
  control: z.infer<typeof AI_AGENT_RUN_CONTROL>,
): Promise<void> {
  if (run.child_chat_id === null) throw new ApiError('conflict', 'This child has no chat binding.');
  const event = ports.store.assistantEvents.event(run.source_id);
  if (event.answered_at !== null || event.delivered_at === null)
    throw new ApiError('conflict', 'This exact child task is no longer running.');
  if (control.action !== 'interrupt')
    throw new ApiError('conflict', 'This child supports interruption only.');
  await ports.interrupt(ports.store.aiChats.chat(run.child_chat_id));
  return;
}

function assertCurrentChild(
  state: ReturnType<ComputerRunner['state']['bound']>,
  run: AiAgentRun,
): void {
  if (
    state.job_id !== run.job_id ||
    state.session_id !== run.session_id ||
    state.context?.process_generation !== run.source_generation
  )
    throw new ApiError('conflict', 'This native child belongs to an earlier parent job.');
}
