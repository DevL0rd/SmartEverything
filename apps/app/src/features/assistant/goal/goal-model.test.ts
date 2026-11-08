import { describe, expect, it } from 'vitest';
import type { ChatTimelineTool } from '@smarteverything/domain';
import { goalRounds, latestGoal, shownGoal } from './goal-model';

function goalCall(
  callId: string,
  value: unknown,
  name = 'update_goal',
  state: ChatTimelineTool['state'] = 'done',
): ChatTimelineTool {
  return {
    callId,
    name,
    title: 'Update the goal',
    state,
    detail: null,
    input: null,
    output: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(value) }] }),
    redacted: false,
    image_operation_id: null,
  };
}

const goal = (phase: string, roundsStarted = 2): unknown => ({
  goal: {
    id: 'g1',
    revision: 3,
    objective: 'Make every test pass',
    phase,
    roundsStarted,
    maxGoalRounds: 10,
    ...(phase === 'blocked'
      ? { blockedReason: { code: 'needs_user', message: 'Needs a key' } }
      : {}),
  },
  activation: 'armed',
});

describe('latestGoal', () => {
  it('reads the newest goal the goal tools reported', () => {
    const shown = latestGoal([
      goalCall('a', goal('active', 1), 'create_goal'),
      goalCall('b', goal('blocked', 4), 'get_goal'),
    ]);
    expect(shown).toEqual({
      objective: 'Make every test pass',
      phase: 'blocked',
      roundsStarted: 4,
      maxGoalRounds: 10,
      blockedReason: 'Needs a key',
    });
  });

  it('treats a cleared goal as no goal and skips failed calls', () => {
    expect(latestGoal([goalCall('a', goal('active')), goalCall('b', { goal: null })])).toBeNull();
    expect(
      latestGoal([
        goalCall('a', goal('paused')),
        goalCall('b', goal('active'), 'update_goal', 'failed'),
      ])?.phase,
    ).toBe('paused');
  });

  it('shows no goal rather than a stale one when the newest call is unreadable', () => {
    expect(
      latestGoal([
        goalCall('a', goal('paused')),
        { ...goalCall('b', goal('active')), output: 'not json' },
        { ...goalCall('c', goal('active')), output: null },
      ]),
    ).toBeNull();
  });

  it('hides a finished goal and states rounds within the cap', () => {
    expect(shownGoal(latestGoal([goalCall('a', goal('complete'))]))).toBeNull();
    const active = latestGoal([goalCall('a', goal('active', 12))]);
    expect(active === null ? null : goalRounds(active)).toBe('Round 10 of 10');
  });
});
