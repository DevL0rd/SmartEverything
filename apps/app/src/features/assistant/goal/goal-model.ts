import { z } from 'zod';
import {
  AI_GOAL_PHASES,
  AI_GOAL_TOOL_NAMES,
  type AiGoalPhase,
  type ChatTimelineTool,
} from '@smarteverything/domain';
import { reportedRecord } from '../model/tool-presentation-text';

const GOAL_TOOLS: ReadonlySet<string> = new Set(AI_GOAL_TOOL_NAMES);

const TOOL_OUTPUT = z.object({
  content: z.array(z.object({ type: z.literal('text'), text: z.string() })).length(1),
});

const GOAL_VALUE = z.object({
  goal: z
    .object({
      objective: z.string().min(1),
      phase: z.enum(AI_GOAL_PHASES),
      roundsStarted: z.int().min(0),
      maxGoalRounds: z.int().min(1),
      blockedReason: z.object({ message: z.string().min(1) }).optional(),
    })
    .nullable(),
});

export interface GoalView {
  readonly objective: string;
  readonly phase: AiGoalPhase;
  readonly roundsStarted: number;
  readonly maxGoalRounds: number;
  readonly blockedReason: string | null;
}

export const GOAL_PHASE_LABEL: Readonly<Record<AiGoalPhase, string>> = {
  active: 'Working',
  paused: 'Paused',
  blocked: 'Blocked',
  complete: 'Done',
};

function reportedGoal(tool: ChatTimelineTool): GoalView | null | undefined {
  const output = TOOL_OUTPUT.safeParse(reportedRecord(tool.output));
  if (!output.success) return undefined;
  const value = GOAL_VALUE.safeParse(reportedRecord(output.data.content[0]?.text ?? null));
  if (!value.success) return undefined;
  const goal = value.data.goal;
  if (goal === null) return null;
  return {
    objective: goal.objective,
    phase: goal.phase,
    roundsStarted: goal.roundsStarted,
    maxGoalRounds: goal.maxGoalRounds,
    blockedReason: goal.blockedReason?.message ?? null,
  };
}

export function latestGoal(tools: readonly ChatTimelineTool[]): GoalView | null {
  for (const tool of [...tools].reverse()) {
    if (!GOAL_TOOLS.has(tool.name) || tool.state !== 'done') continue;
    return reportedGoal(tool) ?? null;
  }
  return null;
}

export function shownGoal(goal: GoalView | null): GoalView | null {
  return goal === null || goal.phase === 'complete' ? null : goal;
}

export function goalRounds(goal: GoalView): string {
  return `Round ${String(Math.min(goal.roundsStarted, goal.maxGoalRounds))} of ${String(goal.maxGoalRounds)}`;
}
