import { describe, expect, it } from 'vitest';
import {
  AI_AGENT_LOOP_SETTINGS,
  AI_GOAL_CHANGE,
  AI_LOOP_EVENT,
  ASSISTANT_SETTINGS,
  ASSISTANT_SETTINGS_CHANGE,
  aiGoalOf,
  foldAiLoopRuns,
} from '../src';
import type { AiLoopRun } from '../src';

const SNAPSHOT = {
  kind: 'goal/change',
  version: 1,
  operation: 'create',
  goal: { id: 'g1', revision: 1, objective: 'Tidy', phase: 'active', maxGoalRounds: 4 },
  roundsStarted: 0,
  createdAt: 10,
  updatedAt: 10,
} as const;

describe('the agent loop settings', () => {
  it('leave every cap unset by default', () => {
    expect(AI_AGENT_LOOP_SETTINGS.parse({})).toStrictEqual({
      goal: {},
      ralph: {},
      workflow: {},
      code: {},
      subagents: {},
      workspace: {},
    });
  });

  it('reject zero, fractions and unknown caps', () => {
    expect(AI_AGENT_LOOP_SETTINGS.safeParse({ goal: { default_max_rounds: 0 } }).success).toBe(
      false,
    );
    expect(AI_AGENT_LOOP_SETTINGS.safeParse({ ralph: { max_rounds: 1.5 } }).success).toBe(false);
    expect(AI_AGENT_LOOP_SETTINGS.safeParse({ code: { timeout: 5 } }).success).toBe(false);
    expect(AI_AGENT_LOOP_SETTINGS.safeParse({ subagents: { max_active: 0 } }).success).toBe(false);
    expect(AI_AGENT_LOOP_SETTINGS.safeParse({ workspace: { present_max_files: 0 } }).success).toBe(
      false,
    );
    expect(AI_AGENT_LOOP_SETTINGS.safeParse({ subagents: { max_depth: 0 } }).success).toBe(true);
    expect(AI_AGENT_LOOP_SETTINGS.safeParse({ chat_loop: {} }).success).toBe(false);
  });

  it('are part of the assistant settings and can be changed on their own', () => {
    expect(ASSISTANT_SETTINGS.parse({}).agent_loops.goal).toStrictEqual({});
    expect(
      ASSISTANT_SETTINGS_CHANGE.parse({ agent_loops: { goal: { default_max_rounds: 9 } } }),
    ).toStrictEqual({
      agent_loops: {
        goal: { default_max_rounds: 9 },
        ralph: {},
        workflow: {},
        code: {},
        subagents: {},
        workspace: {},
      },
    });
  });
});

describe('the goal change record', () => {
  it('turns a snapshot change into the goal state the app shows', () => {
    expect(aiGoalOf(AI_GOAL_CHANGE.parse(SNAPSHOT))).toStrictEqual({
      id: 'g1',
      revision: 1,
      objective: 'Tidy',
      phase: 'active',
      blockedReason: null,
      maxGoalRounds: 4,
      roundsStarted: 0,
      createdAt: 10,
      updatedAt: 10,
    });
  });

  it('carries the blocked reason and ends with a clear', () => {
    const blocked = AI_GOAL_CHANGE.parse({
      ...SNAPSHOT,
      operation: 'block',
      goal: {
        ...SNAPSHOT.goal,
        revision: 2,
        phase: 'blocked',
        blockedReason: { code: 'goal-round-cap', message: 'The round cap was reached.' },
      },
      roundsStarted: 4,
    });
    const cleared = AI_GOAL_CHANGE.parse({
      kind: 'goal/change',
      version: 1,
      operation: 'clear',
      cleared: { id: 'g1', revision: 2 },
      clearedAt: 30,
    });

    expect(aiGoalOf(blocked)?.blockedReason).toStrictEqual({
      code: 'goal-round-cap',
      message: 'The round cap was reached.',
    });
    expect(aiGoalOf(cleared)).toBeNull();
  });

  it('refuses a record with an unknown field', () => {
    expect(AI_GOAL_CHANGE.safeParse({ ...SNAPSHOT, extra: true }).success).toBe(false);
  });
});

describe('the workflow run records', () => {
  const EVENTS = [
    { type: 'tool-workflow/run-start', data: { runId: 'r1', name: 'audit' } },
    {
      type: 'tool-workflow/agent-start',
      data: { runId: 'r1', seq: 0, label: 'a.ts', phase: 'review', childId: 'c1' },
    },
    {
      type: 'tool-workflow/agent-start',
      data: { runId: 'r1', seq: 1, label: 'b.ts', childId: 'c2' },
    },
    { type: 'tool-workflow/agent-end', data: { runId: 'r1', seq: 0, outcome: 'completed' } },
    { type: 'tool-workflow/run-end', data: { runId: 'r1', stopReason: 'completed' } },
  ] as const;

  it('fold into one run with its agents and outcomes', () => {
    const runs = EVENTS.map((event) => AI_LOOP_EVENT.parse(event)).reduce<readonly AiLoopRun[]>(
      foldAiLoopRuns,
      [],
    );

    expect(runs).toStrictEqual([
      {
        runId: 'r1',
        name: 'audit',
        stopReason: 'completed',
        agents: [
          { seq: 0, label: 'a.ts', phase: 'review', childId: 'c1', outcome: 'completed' },
          { seq: 1, label: 'b.ts', phase: null, childId: 'c2', outcome: null },
        ],
      },
    ]);
  });
});
