import { describe, expect, it } from 'vitest';
import { FLOW_TYPE, REF_KIND, REF_KINDS, type FlowType } from '../../src/automation-v3/types';

describe('flow types', () => {
  it('parses every scalar type', () => {
    for (const t of [
      'boolean',
      'text',
      'duration',
      'instant',
      'timeOfDay',
      'date',
      'color',
      'error',
      'any',
    ]) {
      expect(FLOW_TYPE.parse({ t })).toEqual({ t });
    }
  });

  it('parses number refinements', () => {
    const type = { t: 'number', integer: true, min: 0, max: 100, unit: 'percent' };
    expect(FLOW_TYPE.parse(type)).toEqual(type);
  });

  it('parses a reference to every reference kind, including target and secret', () => {
    for (const of of REF_KINDS) {
      expect(FLOW_TYPE.parse({ t: 'ref', of })).toEqual({ t: 'ref', of });
    }
    expect(REF_KINDS).toContain('target');
    expect(REF_KINDS).toContain('secret');
  });

  it('parses a device reference with capabilities', () => {
    expect(
      FLOW_TYPE.parse({ t: 'ref', of: 'device', capabilities: ['power', 'raw:custom'] }),
    ).toEqual({
      t: 'ref',
      of: 'device',
      capabilities: ['power', 'raw:custom'],
    });
  });

  it('rejects an unknown capability and an unknown reference kind', () => {
    expect(
      FLOW_TYPE.safeParse({ t: 'ref', of: 'device', capabilities: ['nonsense'] }).success,
    ).toBe(false);
    expect(FLOW_TYPE.safeParse({ t: 'ref', of: 'toaster' }).success).toBe(false);
    expect(REF_KIND.safeParse('toaster').success).toBe(false);
  });

  it('parses nested lists, optionals and records', () => {
    const type: FlowType = {
      t: 'list',
      of: {
        t: 'optional',
        of: { t: 'record', fields: { level: { t: 'number' } }, values: { t: 'text' } },
      },
    };
    expect(FLOW_TYPE.parse(type)).toEqual(type);
  });

  it('parses a choice and a generic parameter', () => {
    const choice = { t: 'choice', options: [{ id: 'a', label: 'A' }] };
    expect(FLOW_TYPE.parse(choice)).toEqual(choice);
    expect(FLOW_TYPE.parse({ t: 'param', name: 'item' })).toEqual({ t: 'param', name: 'item' });
  });

  it('rejects an empty choice, extra keys, bad record keys and unknown tags', () => {
    expect(FLOW_TYPE.safeParse({ t: 'choice', options: [] }).success).toBe(false);
    expect(FLOW_TYPE.safeParse({ t: 'text', extra: 1 }).success).toBe(false);
    expect(FLOW_TYPE.safeParse({ t: 'record', fields: { Bad: { t: 'text' } } }).success).toBe(
      false,
    );
    expect(FLOW_TYPE.safeParse({ t: 'param', name: 'vars' }).success).toBe(false);
    expect(FLOW_TYPE.safeParse({ t: 'null' }).success).toBe(false);
    expect(FLOW_TYPE.safeParse({ t: 'list' }).success).toBe(false);
  });
});
