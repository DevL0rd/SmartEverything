import { describe, expect, it } from 'vitest';
import type { InputPort } from '@smarteverything/domain';
import { calledRun, resolveCalledInputs } from '../../../src/automations/triggers-v3/called';
import { node } from './support';

const declared: readonly InputPort[] = [
  { name: 'level', type: { t: 'number' }, required: true },
  { name: 'label', type: { t: 'text' }, required: false, default: 'none' },
];

describe('called entry', () => {
  it('applies defaults and checks required inputs, types and unknown names', () => {
    expect(resolveCalledInputs(declared, { level: 3 })).toEqual({
      ok: true,
      value: { level: 3, label: 'none' },
    });
    expect(resolveCalledInputs(declared, {})).toMatchObject({ ok: false, class: 'Invalid' });
    expect(resolveCalledInputs(declared, { level: 'high' })).toMatchObject({
      ok: false,
      message: 'Input "level" does not fit its type',
    });
    expect(resolveCalledInputs(declared, { level: 1, extra: 1 })).toMatchObject({
      ok: false,
      message: 'This automation has no input "extra"',
    });
  });

  it('starts through a called entry with key call', () => {
    const entry = node('trigger.called', {});
    const run = calledRun({
      automationId: 'auto',
      nodes: [node('trigger.time', { at: '09:00' }), entry],
      declared,
      given: { level: 2 },
      at: new Date('2026-10-19T08:00:00.000Z'),
    });
    expect(run).toMatchObject({
      ok: true,
      value: {
        fire: { triggerId: entry.id, key: 'call', kind: 'trigger.called' },
        inputs: { level: 2, label: 'none' },
      },
    });
  });

  it('starts manually with key manual when there is no called entry or it is disabled', () => {
    for (const nodes of [[], [node('trigger.called', {}, { enabled: false })]]) {
      const run = calledRun({
        automationId: 'auto',
        nodes,
        declared: [],
        given: {},
        at: new Date('2026-10-19T08:00:00.000Z'),
      });
      expect(run).toMatchObject({
        ok: true,
        value: { fire: { triggerId: 'manual', key: 'manual' }, inputs: {} },
      });
    }
  });

  it('refuses a start with bad inputs', () => {
    expect(
      calledRun({
        automationId: 'auto',
        nodes: [],
        declared,
        given: {},
        at: new Date('2026-10-19T08:00:00.000Z'),
      }),
    ).toMatchObject({ ok: false });
  });
});
