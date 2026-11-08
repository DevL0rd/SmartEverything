import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import { AI_AGENT_LOOP_SETTINGS, AI_GOAL_CHANGE, aiGoalOf } from '@smarteverything/domain';
import type { AiAgentLoopSettings, AiGoalState } from '@smarteverything/domain';
import { bindAgentLoopSettings } from '../src/plugins/goals';
import { bootRuntime } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
let anchor: Context | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
  anchor = undefined;
});

async function boot(): Promise<RuntimeFixture> {
  fixture = await bootRuntime({
    mount: (ctx: Context) => {
      anchor = ctx;
    },
  });
  return fixture;
}

function settings(goal: AiAgentLoopSettings['goal']): AiAgentLoopSettings {
  return AI_AGENT_LOOP_SETTINGS.parse({ goal });
}

function goalOf(host: RuntimeFixture, sessionId: string): AiGoalState | null {
  return host.persistence
    .events(sessionId)
    .filter((event) => event.type === 'goal/change')
    .map((event) => AI_GOAL_CHANGE.parse(event.data))
    .reduce<AiGoalState | null>((_state, change) => aiGoalOf(change), null);
}

describe('the goal commands and tools', () => {
  it('lists /goal and offers the three goal tools to the model', async () => {
    const host = await boot();
    host.model.script({ kind: 'text', text: 'hi' });
    const session = await host.runtime.create(host.sessionOptions());

    const commands = session.commands().map((command) => command.name);
    session.text('hello');
    await session.drain();

    expect(commands).toContain('goal');
    const tools = host.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
    expect(tools).toStrictEqual(expect.arrayContaining(['get_goal', 'create_goal', 'update_goal']));
  });
});

describe('the goal round cap', () => {
  it('stops automatic rounds at the cap taken from the settings', async () => {
    const host = await boot();
    if (anchor === undefined) throw new Error('The test mount did not run.');
    await bindAgentLoopSettings(anchor, settings({ default_max_rounds: 2 }));
    host.model.script(
      { kind: 'text', text: 'round one' },
      { kind: 'text', text: 'round two' },
      { kind: 'text', text: 'must not run' },
    );
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    const created = await session.command('/goal Tidy the notes', []);

    expect(created?.result.kind).toBe('success');
    await vi.waitFor(() => {
      expect(goalOf(host, options.sessionId)?.phase).toBe('blocked');
    });
    await session.drain();
    const goal = goalOf(host, options.sessionId);
    expect(goal).toMatchObject({ maxGoalRounds: 2, roundsStarted: 2, phase: 'blocked' });
    expect(host.model.requests).toHaveLength(2);
  });
});

describe('goals created by the model', () => {
  it('uses the cap from the settings when the model names none', async () => {
    const host = await boot();
    if (anchor === undefined) throw new Error('The test mount did not run.');
    await bindAgentLoopSettings(anchor, settings({ default_max_rounds: 3 }));
    host.model.script(
      {
        kind: 'tool',
        id: 'g1',
        name: 'create_goal',
        input: { objective: 'Sort the photos' },
      },
      { kind: 'text', text: 'Goal set.' },
    );
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    session.text('Please make it a goal to sort the photos');
    await vi.waitFor(() => {
      expect(goalOf(host, options.sessionId)?.objective).toBe('Sort the photos');
    });

    expect(goalOf(host, options.sessionId)).toMatchObject({ maxGoalRounds: 3, phase: 'active' });
  });

  it('puts the blocked threshold from the settings into the guidance to the model', async () => {
    const host = await boot();
    if (anchor === undefined) throw new Error('The test mount did not run.');
    await bindAgentLoopSettings(anchor, settings({ blocked_after_rounds: 7 }));
    host.model.script({ kind: 'text', text: 'ok' });
    const session = await host.runtime.create(host.sessionOptions());

    session.text('hello');
    await session.drain();

    expect(JSON.stringify(host.model.requests[0])).toContain('at least 7 consecutive goal rounds');
  });

  it('keeps the harness default when no setting names a cap', async () => {
    const host = await boot();
    host.model.script(
      { kind: 'tool', id: 'g1', name: 'create_goal', input: { objective: 'Sort the photos' } },
      { kind: 'text', text: 'Goal set.' },
    );
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    session.text('Please make it a goal to sort the photos');
    await vi.waitFor(() => {
      expect(goalOf(host, options.sessionId)?.objective).toBe('Sort the photos');
    });

    expect(goalOf(host, options.sessionId)?.maxGoalRounds).toBeGreaterThan(0);
  });
});

describe('a goal that needs more than one turn', () => {
  it('runs the round driver after the first turn and counts each continuation round', async () => {
    const host = await boot();
    const options = host.sessionOptions();
    host.model.script(
      { kind: 'tool', id: 'g1', name: 'create_goal', input: { objective: 'Write 1 to 3' } },
      { kind: 'text', text: 'Written 1.' },
    );
    host.model.guard = (): void => {
      const goal = goalOf(host, options.sessionId);
      if (goal === null || host.model.requests.length < 2) return;
      host.model.script(
        host.model.requests.length === 2
          ? { kind: 'text', text: 'Written 2.' }
          : {
              kind: 'tool',
              id: 'u1',
              name: 'update_goal',
              input: {
                goal_id: goal.id,
                revision: goal.revision,
                action: 'complete',
                objective: '',
                max_goal_rounds: 3,
                blocked_reason: '',
              },
            },
      );
    };
    const session = await host.runtime.create(options);

    session.text('Make it a goal to write the numbers 1 to 3');

    await vi.waitFor(() => {
      expect(goalOf(host, options.sessionId)?.phase).toBe('complete');
    });
    expect(goalOf(host, options.sessionId)?.roundsStarted).toBeGreaterThanOrEqual(1);
  });
});
