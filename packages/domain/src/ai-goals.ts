import { z } from 'zod';

const COUNT = z.int().min(1);

export const AI_GOAL_SETTINGS = z.strictObject({
  default_max_rounds: COUNT.optional().describe(
    'Automatic rounds a new goal may use when the AI or the person does not name a cap; unset uses the harness default',
  ),
  blocked_after_rounds: COUNT.optional().describe(
    'Consecutive rounds the same obstacle must persist before the AI may report a goal as blocked; unset uses the harness default',
  ),
});

export const AI_RALPH_SETTINGS = z.strictObject({
  max_rounds: COUNT.optional().describe(
    'Fresh-agent rounds one ralph loop may run, also the ceiling for a cap the AI names; unset uses the harness default',
  ),
  handoff_chars: COUNT.optional().describe(
    'Characters one round may hand to the next; unset uses the harness default',
  ),
  result_chars: COUNT.optional().describe(
    'Characters of the final ralph result returned to the AI; unset uses the harness default',
  ),
});

export const AI_WORKFLOW_SETTINGS = z.strictObject({
  max_concurrent_agents: COUNT.optional().describe(
    'Agents one workflow may run at the same time; unset sizes it from the processors of the machine',
  ),
  max_total_agents: COUNT.optional().describe(
    'Agents one workflow run may start in total; unset uses the harness default',
  ),
  max_items_per_call: COUNT.optional().describe(
    'Items one parallel or pipeline step of a workflow script accepts; unset uses the harness default',
  ),
  sync_timeout_ms: COUNT.optional().describe(
    'Milliseconds the first synchronous part of a workflow script may run; unset uses the harness default',
  ),
  result_chars: COUNT.optional().describe(
    'Characters of the workflow result shown to the AI before it is cut; unset uses the harness default',
  ),
});

export const AI_CODE_SETTINGS = z.strictObject({
  max_output_bytes: COUNT.optional().describe(
    'Bytes of logs and results one code run may produce; unset uses the harness default',
  ),
  max_heap_mb: COUNT.optional().describe(
    'Megabytes of memory one code process may use; unset uses the harness default',
  ),
  max_message_bytes: COUNT.optional().describe(
    'Bytes of one message between the code process and the harness; unset uses the harness default',
  ),
  max_pending_calls: COUNT.optional().describe(
    'Tool calls and agent waits one code run may have open at once, which also bounds workflow concurrency; unset uses the harness default',
  ),
  grace_ms: COUNT.optional().describe(
    'Milliseconds a stopped code process gets to finish before it is ended; unset uses the harness default',
  ),
});

export const AI_SUBAGENT_SETTINGS = z.strictObject({
  max_depth: z
    .int()
    .min(0)
    .optional()
    .describe(
      'How many levels deep helpers may start helpers of their own, 0 turns delegation off; unset uses the harness default',
    ),
  max_active: COUNT.optional().describe(
    'Helpers that may work at the same time under one chat; unset uses the harness default',
  ),
});

export const AI_WORKSPACE_SETTINGS = z.strictObject({
  present_max_files: COUNT.optional().describe(
    'Files the AI may hand over as deliverables in one present call; unset uses the harness default',
  ),
});

export const AI_AGENT_LOOP_SETTINGS = z.strictObject({
  goal: AI_GOAL_SETTINGS.prefault({}),
  ralph: AI_RALPH_SETTINGS.prefault({}),
  workflow: AI_WORKFLOW_SETTINGS.prefault({}),
  code: AI_CODE_SETTINGS.prefault({}),
  subagents: AI_SUBAGENT_SETTINGS.prefault({}),
  workspace: AI_WORKSPACE_SETTINGS.prefault({}),
});

export type AiAgentLoopSettings = z.output<typeof AI_AGENT_LOOP_SETTINGS>;

export const AI_GOAL_TOOL_NAMES = ['get_goal', 'create_goal', 'update_goal'] as const;

export const AI_CODE_EXECUTION_TOOL_NAMES = ['workflow', 'ralph'] as const;

export const AI_GOAL_PHASES = ['active', 'paused', 'blocked', 'complete'] as const;

export type AiGoalPhase = (typeof AI_GOAL_PHASES)[number];

const GOAL_REF = z.strictObject({ id: z.string().min(1), revision: z.int().min(1) });

const GOAL_SNAPSHOT = z.strictObject({
  ...GOAL_REF.shape,
  objective: z.string().min(1),
  phase: z.enum(AI_GOAL_PHASES),
  blockedReason: z.strictObject({ code: z.string().min(1), message: z.string().min(1) }).optional(),
  maxGoalRounds: COUNT,
});

export const AI_GOAL_CHANGE = z.discriminatedUnion('operation', [
  z.strictObject({
    kind: z.literal('goal/change'),
    version: z.literal(1),
    operation: z.enum(['create', 'edit', 'pause', 'resume', 'complete', 'block']),
    goal: GOAL_SNAPSHOT,
    roundsStarted: z.int().min(0),
    createdAt: z.number(),
    updatedAt: z.number(),
  }),
  z.strictObject({
    kind: z.literal('goal/change'),
    version: z.literal(1),
    operation: z.literal('clear'),
    cleared: GOAL_REF,
    clearedAt: z.number(),
  }),
]);

export type AiGoalChange = z.output<typeof AI_GOAL_CHANGE>;

export const AI_GOAL_STATE = z.strictObject({
  id: z.string().min(1),
  revision: z.int().min(1),
  objective: z.string().min(1),
  phase: z.enum(AI_GOAL_PHASES),
  blockedReason: z.strictObject({ code: z.string().min(1), message: z.string().min(1) }).nullable(),
  maxGoalRounds: COUNT,
  roundsStarted: z.int().min(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type AiGoalState = z.output<typeof AI_GOAL_STATE>;

export function aiGoalOf(change: AiGoalChange): AiGoalState | null {
  if (change.operation === 'clear') return null;
  return {
    id: change.goal.id,
    revision: change.goal.revision,
    objective: change.goal.objective,
    phase: change.goal.phase,
    blockedReason: change.goal.blockedReason ?? null,
    maxGoalRounds: change.goal.maxGoalRounds,
    roundsStarted: change.roundsStarted,
    createdAt: change.createdAt,
    updatedAt: change.updatedAt,
  };
}

export const AI_LOOP_AGENT_OUTCOMES = ['completed', 'failed', 'cancelled'] as const;

export const AI_LOOP_STOP_REASONS = ['completed', 'cancelled', 'error'] as const;

export const AI_LOOP_EVENT = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('tool-workflow/run-start'),
    data: z.strictObject({ runId: z.string().min(1), name: z.string().min(1) }),
  }),
  z.strictObject({
    type: z.literal('tool-workflow/agent-start'),
    data: z.strictObject({
      runId: z.string().min(1),
      seq: z.int().min(0),
      label: z.string(),
      phase: z.string().optional(),
      childId: z.string().min(1),
    }),
  }),
  z.strictObject({
    type: z.literal('tool-workflow/agent-end'),
    data: z.strictObject({
      runId: z.string().min(1),
      seq: z.int().min(0),
      outcome: z.enum(AI_LOOP_AGENT_OUTCOMES),
    }),
  }),
  z.strictObject({
    type: z.literal('tool-workflow/run-end'),
    data: z.strictObject({
      runId: z.string().min(1),
      stopReason: z.enum(AI_LOOP_STOP_REASONS),
    }),
  }),
]);

export type AiLoopEvent = z.output<typeof AI_LOOP_EVENT>;

export interface AiLoopAgent {
  readonly seq: number;
  readonly label: string;
  readonly phase: string | null;
  readonly childId: string;
  readonly outcome: (typeof AI_LOOP_AGENT_OUTCOMES)[number] | null;
}

export interface AiLoopRun {
  readonly runId: string;
  readonly name: string;
  readonly stopReason: (typeof AI_LOOP_STOP_REASONS)[number] | null;
  readonly agents: readonly AiLoopAgent[];
}

function updateRun(
  runs: readonly AiLoopRun[],
  runId: string,
  update: (run: AiLoopRun) => AiLoopRun,
): readonly AiLoopRun[] {
  return runs.map((run) => (run.runId === runId ? update(run) : run));
}

function updateAgent(
  run: AiLoopRun,
  seq: number,
  update: (agent: AiLoopAgent) => AiLoopAgent,
): AiLoopRun {
  return { ...run, agents: run.agents.map((agent) => (agent.seq === seq ? update(agent) : agent)) };
}

export function foldAiLoopRuns(
  runs: readonly AiLoopRun[],
  event: AiLoopEvent,
): readonly AiLoopRun[] {
  switch (event.type) {
    case 'tool-workflow/run-start':
      return [
        ...runs,
        { runId: event.data.runId, name: event.data.name, stopReason: null, agents: [] },
      ];
    case 'tool-workflow/agent-start':
      return updateRun(runs, event.data.runId, (run) => ({
        ...run,
        agents: [
          ...run.agents,
          {
            seq: event.data.seq,
            label: event.data.label,
            phase: event.data.phase ?? null,
            childId: event.data.childId,
            outcome: null,
          },
        ],
      }));
    case 'tool-workflow/agent-end':
      return updateRun(runs, event.data.runId, (run) =>
        updateAgent(run, event.data.seq, (agent) => ({ ...agent, outcome: event.data.outcome })),
      );
    case 'tool-workflow/run-end':
      return updateRun(runs, event.data.runId, (run) => ({
        ...run,
        stopReason: event.data.stopReason,
      }));
  }
}
