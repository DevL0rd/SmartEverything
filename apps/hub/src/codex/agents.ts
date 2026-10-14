import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AI_AGENT_RUN,
  type AiAgentRun,
  type AiAgentState,
  type CodexProviderTurn,
} from '@smarteverything/domain';
import type { RpcRecord } from './protocol';
import { CodexRuntimeError } from './errors';
const COLLAB = z.object({
  id: z.string(),
  type: z.literal('collabAgentToolCall'),
  tool: z.enum([
    'spawnAgent',
    'sendInput',
    'resumeAgent',
    'wait',
    'closeAgent',
    'sendMessage',
    'followupTask',
    'interruptAgent',
    'listAgents',
  ]),
  senderThreadId: z.string(),
  receiverThreadIds: z.array(z.string()),
  prompt: z.string().nullable(),
  model: z.string().nullable(),
  reasoningEffort: z.string().nullable(),
  agentsStates: z.record(
    z.string(),
    z.object({
      status: z.enum([
        'pendingInit',
        'running',
        'interrupted',
        'completed',
        'errored',
        'shutdown',
        'notFound',
      ]),
      message: z.string().nullable(),
    }),
  ),
});
const STATES: Readonly<Record<string, AiAgentState>> = {
  pendingInit: 'queued',
  running: 'running',
  interrupted: 'interrupted',
  completed: 'completed',
  errored: 'failed',
  shutdown: 'stopped',
  notFound: 'unknown',
};
export class CodexAgents {
  private readonly runs = new Map<string, AiAgentRun>();
  constructor(
    private readonly options: {
      readonly turn: CodexProviderTurn;
      readonly generation: string;
      readonly root: string;
      readonly cwd: string;
      readonly publish: (run: AiAgentRun) => void;
      readonly now: () => string;
    },
  ) {}
  item(raw: unknown, turnId: string): void {
    const parsed = COLLAB.safeParse(raw);
    if (!parsed.success) return;
    const item = parsed.data;
    if (item.senderThreadId !== this.options.root && !this.owns(item.senderThreadId)) return;
    for (const child of item.receiverThreadIds) {
      if (item.tool !== 'spawnAgent' && !this.owns(child)) continue;
      const native = item.agentsStates[child];
      if (native !== undefined) this.child({ item, child, native, turnId });
    }
  }
  private child(input: {
    readonly item: z.infer<typeof COLLAB>;
    readonly child: string;
    readonly native: z.infer<typeof COLLAB>['agentsStates'][string];
    readonly turnId: string;
  }): void {
    const { item, child, native, turnId } = input;
    const old = [...this.runs.values()].findLast((run) => run.session_id === child);
    const state = STATES[native.status];
    if (state === undefined)
      throw new CodexRuntimeError('agents', 'Codex child status has no implemented normalization.');
    if (old === undefined && this.runs.size >= 1000)
      throw new CodexRuntimeError('agents', 'Codex child projection capacity reached.');
    if (old !== undefined && terminal(old.state) && !terminal(state)) return;
    const key = old?.source_id ?? JSON.stringify([this.options.root, turnId, item.id, child]);
    const identity = this.identity(key, child, old, this.parentRun(item.senderThreadId));
    const details = agentDetails({ item, native, state, previous: old, now: this.options.now() });
    this.update(key, AI_AGENT_RUN.parse({ ...identity, ...details }));
  }
  private parentRun(threadId: string): string | null {
    return [...this.runs.values()].findLast((run) => run.session_id === threadId)?.id ?? null;
  }
  private identity(
    key: string,
    child: string,
    old: AiAgentRun | undefined,
    parent: string | null,
  ): Partial<AiAgentRun> {
    const { turn, generation, cwd, now } = this.options;
    return {
      id: old?.id ?? randomUUID(),
      parent_chat_id: turn.chat_id,
      profile_id: turn.profile_id,
      source: 'codex',
      source_id: key,
      parent_run_id: old?.parent_run_id ?? parent,
      child_chat_id: null,
      device_id: turn.device_id,
      runtime: 'codex',
      session_id: child,
      job_id: turn.job_id,
      source_generation: generation,
      source_seq: (old?.source_seq ?? 0) + 1,
      source_revision: 0,
      title: `Codex agent ${child}`.slice(0, 500),
      cwd,
      started_at: old?.started_at ?? now(),
      usage: null,
      supported_actions: [],
      truncated: false,
    };
  }
  owns(threadId: string): boolean {
    return [...this.runs.values()].some((run) => run.session_id === threadId);
  }
  text(threadId: string, params: RpcRecord): void {
    const delta = z.string().parse(params['delta']);
    for (const [key, run] of this.runs)
      if (run.session_id === threadId) {
        const combined = `${run.progress ?? ''}${delta}`;
        this.update(key, {
          ...run,
          progress: combined.slice(-16_000),
          truncated: run.truncated || combined.length > 16_000,
          source_seq: run.source_seq + 1,
          updated_at: this.options.now(),
        });
      }
  }
  lost(reason: string): void {
    for (const [key, run] of this.runs)
      if (!terminal(run.state))
        this.update(key, {
          ...run,
          state: 'unknown',
          last_known_state: run.state,
          observability_reason: reason.slice(0, 2000),
          source_seq: run.source_seq + 1,
          updated_at: this.options.now(),
        });
  }
  list(): AiAgentRun[] {
    return [...this.runs.values()];
  }
  private update(key: string, run: AiAgentRun): void {
    this.runs.set(key, run);
    this.options.publish(run);
  }
}
function terminal(state: AiAgentState): boolean {
  return ['completed', 'stopped', 'interrupted', 'failed'].includes(state);
}

function agentDetails(input: {
  readonly item: z.infer<typeof COLLAB>;
  readonly native: z.infer<typeof COLLAB>['agentsStates'][string];
  readonly state: AiAgentState;
  readonly previous: AiAgentRun | undefined;
  readonly now: string;
}): Partial<AiAgentRun> {
  const { item, native, state, previous, now } = input;
  return {
    task: previous?.task ?? boundedText(item.prompt, 200_000),
    state,
    last_known_state: knownState(state, previous),
    observability_reason:
      state === 'unknown' ? 'The owning Codex runtime could not locate this child.' : null,
    progress: state === 'running' ? boundedText(native.message, 16_000) : null,
    result: state === 'completed' ? boundedText(native.message, 200_000) : null,
    error: state === 'failed' ? boundedText(native.message, 16_000) : null,
    model: item.model,
    effort: item.reasoningEffort,
    updated_at: now,
    completed_at: terminal(state) ? now : null,
    truncated: previous?.truncated === true || oversizedDetails(item.prompt, native.message, state),
  };
}

function knownState(state: AiAgentState, previous: AiAgentRun | undefined): AiAgentState | null {
  return state === 'unknown' ? (previous?.state ?? null) : null;
}

function oversizedDetails(
  task: string | null,
  message: string | null,
  state: AiAgentState,
): boolean {
  const limit = state === 'completed' ? 200_000 : 16_000;
  return (task?.length ?? 0) > 200_000 || (message?.length ?? 0) > limit;
}

function boundedText(text: string | null, limit: number): string | null {
  return text?.slice(0, limit) ?? null;
}
