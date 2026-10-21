import { describe, expect, it } from 'vitest';
import { outcomeOf } from '../../src/extensions/mcp/tools/outcome';

const AUTOMATION = {
  id: '6c1b7d20-1111-4222-8333-444455556666',
  name: 'Porch light',
  enabled: true,
  revision: 3,
  definition: {
    when: [{ on: 'signal', source: 'event', kind: 'motion' }],
    steps: Array.from({ length: 12 }, (_, index) => ({
      do: 'set',
      target: { device: `device-${String(index)}` },
      control: 'power',
      to: index % 2 === 0,
    })),
  },
  last_run_at: null,
  last_error: null,
  run_count: 0,
  created_at: '2026-10-16T08:00:00.000Z',
  updated_at: '2026-10-16T08:00:00.000Z',
};

describe('the compact answer to a write or action tool', () => {
  it('keeps the problems a refused program check names, with their fix', () => {
    const problem = {
      severity: 'error',
      code: 'type_mismatch',
      key: 'lights',
      port: 'target',
      message: 'target needs target but gets device.',
      fix: { summary: 'Pass a target' },
    };
    const answer = outcomeOf('check_automation', {
      result: {
        ok: false,
        summary: 'Checked: 1 error.',
        id: null,
        revision: null,
        problems: [problem],
      },
    });
    expect(answer).toMatchObject({ ok: false, problems: [problem] });
  });

  it('keeps what a dry run would send and why it failed', () => {
    const command = {
      at: '2026-10-19T12:00:00.000Z',
      runId: 'r1',
      path: 'body/ops/0',
      node: 'on',
      kind: 'device.set',
      key: 'r1/f0:0',
      targets: ['lamp'],
      params: { control: 'power', to: true },
      outcome: 'ok',
    };
    const answer = outcomeOf('automation_run', {
      result: {
        ok: false,
        summary: 'The dry run failed.',
        mode: 'dry',
        status: 'rehearsed',
        run: null,
        outputs: null,
        rehearsal: {
          outcome: 'failed',
          error: 'no light',
          now: null,
          steps: 3,
          run: null,
          nodes: [{}, {}],
          commands: [command],
          paused: [],
          outputs: null,
        },
      },
    });
    expect(answer['rehearsal']).toStrictEqual({
      outcome: 'failed',
      error: 'no light',
      steps: 3,
      nodes: 2,
      commands: [
        {
          node: 'on',
          kind: 'device.set',
          targets: ['lamp'],
          params: { control: 'power', to: true },
          outcome: 'ok',
        },
      ],
    });
  });

  it('names a saved entity by id and revision instead of echoing it', () => {
    const answer = outcomeOf('update_automation', { result: AUTOMATION });
    expect(answer).toMatchObject({
      ok: true,
      summary: 'Updated automation “Porch light”',
      id: AUTOMATION.id,
      enabled: true,
    });
    expect(answer['revision']).toBe(3);
    expect(JSON.stringify(answer).length * 5).toBeLessThan(JSON.stringify(AUTOMATION).length);
  });

  it('uses the revision an entity states itself', () => {
    expect(
      outcomeOf('update_automation_value', { result: { id: 'v1', revision: 4, content: {} } }),
    ).toMatchObject({ id: 'v1', revision: 4 });
  });

  it('reports a removal or other bare acknowledgement as ok with a sentence', () => {
    expect(outcomeOf('remove_room', { result: { ok: true } })).toStrictEqual({
      ok: true,
      summary: 'Removed room',
    });
    expect(outcomeOf('stop_automation_runs', { result: null })).toStrictEqual({
      ok: true,
      summary: 'Stopped automation runs',
    });
  });

  it('finds the entity inside a wrapper and keeps the wrapper outcome', () => {
    expect(
      outcomeOf('schedule_actions', {
        result: { outcome: 'created', schedule: { id: 's1', label: 'Lights', steps: [1, 2] } },
      }),
    ).toStrictEqual({
      ok: true,
      summary: 'Scheduled actions “Lights”',
      id: 's1',
      outcome: 'created',
    });
  });

  it('counts finished, failed, running and skipped device commands and lists the problems', () => {
    const answer = outcomeOf('device_control', {
      commands: [
        { device: 'Lamp', capability: 'power', status: 'succeeded', now: true, error: null },
        { device: 'Fan', capability: 'power', status: 'failed', error: 'offline' },
        { device: 'Heater', capability: 'power', status: 'running', error: null },
      ],
      allFinished: false,
      skipped: [{ device_id: 'x', device: 'Clock', reason: 'Display is read-only' }],
    });
    expect(answer).toStrictEqual({
      ok: false,
      summary: 'Controlled device: 1 of 3 commands done, 1 failed, 1 still running, 1 skipped',
      changed: [{ device: 'Lamp', capability: 'power', now: true }],
      failed: [{ device: 'Fan', capability: 'power', reason: 'offline' }],
      skipped: [{ item: 'Clock', reason: 'Display is read-only' }],
    });
  });

  it('turns a failed outcome into ok false with the reason', () => {
    expect(
      outcomeOf('start_conversation', {
        result: { id: 'o1', state: 'failed', detail: 'No answer' },
      }),
    ).toMatchObject({ ok: false, error: 'No answer', state: 'failed' });
  });

  it('summarises a list of entities by count and ids', () => {
    expect(outcomeOf('stop_automation_runs', { result: [{ id: 'a' }, { id: 'b' }] })).toStrictEqual(
      {
        ok: true,
        summary: 'Stopped 2 automation runs',
        count: 2,
        ids: ['a', 'b'],
      },
    );
  });
});
