import { describe, expect, it } from 'vitest';
import type { FlowNode, InputPort, NodeKind } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import {
  REMOVED_REASON,
  calledInputsModel,
  clearLeftoverOps,
  hasCalledInputs,
  offNote,
  type CalledAutomation,
  type CalledLookup,
} from './called-inputs-model';

function kindOf(id: string): NodeKind {
  const kind = NODE_REGISTRY.get(id);
  if (kind === undefined) throw new Error(`no kind ${id}`);
  return kind;
}

const RUN = kindOf('automation.run');

const DECLARED: readonly InputPort[] = [
  { name: 'level', label: 'Brightness', type: { t: 'number', min: 0, max: 100 }, required: true },
  { name: 'quiet', type: { t: 'boolean' }, required: true, default: false },
  { name: 'room', type: { t: 'ref', of: 'room' }, required: false },
  { name: 'colour', type: { t: 'optional', of: { t: 'color' } }, required: false },
];

const CALLED: CalledAutomation = { name: 'Evening lights', enabled: true, inputs: DECLARED };

function lookupOf(entries: Readonly<Record<string, CalledAutomation>>): CalledLookup {
  return (id) => entries[id];
}

function runNode(ports: FlowNode['ports']): FlowNode {
  return { id: '00000000-0000-4000-8000-000000000001', key: 'run', kind: RUN.id, ports };
}

describe('calledInputsModel', () => {
  it('shows nothing until an automation is picked', () => {
    expect(calledInputsModel(RUN, runNode({}), lookupOf({})).kind).toBe('none');
    expect(calledInputsModel(RUN, runNode({ automation: { lit: '' } }), lookupOf({})).kind).toBe(
      'none',
    );
  });

  it('says why when the picked automation was removed', () => {
    const model = calledInputsModel(RUN, runNode({ automation: { lit: 'gone' } }), lookupOf({}));
    expect(model).toEqual({ kind: 'missing', reason: REMOVED_REASON });
  });

  it('gives one typed field per declared input, in the declared order', () => {
    const node = runNode({ automation: { lit: 'a1' }, level: { lit: 40 } });
    const model = calledInputsModel(RUN, node, lookupOf({ a1: CALLED }));
    if (model.kind !== 'ready') throw new Error('expected ready');
    expect(model.rows.map((row) => [row.port.name, row.title, row.control.t])).toEqual([
      ['level', 'Brightness', 'number'],
      ['quiet', 'Quiet', 'switch'],
      ['room', 'Room', 'reference'],
      ['colour', 'Colour', 'colour'],
    ]);
    expect(model.rows[0]?.value).toEqual({ lit: 40 });
    expect(model.rows[1]?.value).toBeUndefined();
  });

  it('treats an input with a default as not required', () => {
    const model = calledInputsModel(
      RUN,
      runNode({ automation: { lit: 'a1' } }),
      lookupOf({ a1: CALLED }),
    );
    if (model.kind !== 'ready') throw new Error('expected ready');
    expect(model.rows.map((row) => [row.port.name, row.required])).toEqual([
      ['level', true],
      ['quiet', false],
      ['room', false],
      ['colour', false],
    ]);
  });

  it('lists inputs the picked automation does not declare, and clears them in one edit', () => {
    const node = runNode({
      automation: { lit: 'a1' },
      wait: { lit: true },
      level: { lit: 10 },
      scene: { lit: 'old' },
      speed: { lit: 2 },
    });
    const model = calledInputsModel(RUN, node, lookupOf({ a1: CALLED }));
    if (model.kind !== 'ready') throw new Error('expected ready');
    expect(model.leftover).toEqual(['scene', 'speed']);
    expect(clearLeftoverOps('run', model.leftover)).toEqual([
      { op: 'unset', key: 'run', ports: ['scene', 'speed'] },
    ]);
    expect(clearLeftoverOps('run', [])).toEqual([]);
  });

  it('notes when the picked automation is off', () => {
    const off = { ...CALLED, enabled: false };
    const model = calledInputsModel(
      RUN,
      runNode({ automation: { lit: 'a1' } }),
      lookupOf({ a1: off }),
    );
    if (model.kind !== 'ready') throw new Error('expected ready');
    expect(model.off).toBe(offNote('Evening lights'));
  });

  it('applies only to the Run automation step', () => {
    expect(hasCalledInputs(RUN)).toBe(true);
    expect(hasCalledInputs(kindOf('fn.call'))).toBe(false);
    expect(hasCalledInputs(undefined)).toBe(false);
  });
});
