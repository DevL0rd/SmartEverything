import { describe, expect, it } from 'vitest';
import type { FlowNode, NodeKind } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { inputsModel, ownedPorts } from './inputs-model';

function kindOf(id: string): NodeKind {
  const kind = NODE_REGISTRY.get(id);
  if (kind === undefined) throw new Error(`no kind ${id}`);
  return kind;
}

function nodeOf(kind: string, ports: FlowNode['ports'] = {}): FlowNode {
  return { id: '00000000-0000-4000-8000-000000000001', key: 'a', kind, ports };
}

describe('ports other sections own', () => {
  it('leaves out the ports edited by Loop limits, For each, Switch, Do together, Break and Return', () => {
    expect([...ownedPorts(kindOf('flow.while'))].toSorted()).toEqual(['gap', 'limit']);
    expect([...ownedPorts(kindOf('flow.for_each'))].toSorted()).toEqual(['collect', 'concurrency']);
    expect([...ownedPorts(kindOf('flow.switch'))]).toEqual(['mode']);
    expect([...ownedPorts(kindOf('flow.parallel'))].toSorted()).toEqual(['errors', 'join']);
    expect([...ownedPorts(kindOf('flow.break'))]).toEqual(['target']);
    expect([...ownedPorts(kindOf('flow.return'))]).toEqual(['exit']);
    expect([...ownedPorts(kindOf('fn.call'))].toSorted()).toEqual(['fn', 'pin']);
  });

  it('keeps none of them in the inputs list', () => {
    const model = inputsModel(kindOf('flow.while'), nodeOf('flow.while'));
    expect(model.rows.map((row) => row.field.name)).toEqual(['condition']);
    expect(model.form).toEqual([]);
  });
});

describe('inputsModel', () => {
  it('puts plain static options in the form and the rest in rows', () => {
    const model = inputsModel(kindOf('flow.stop'), nodeOf('flow.stop', { failed: { lit: true } }));
    expect(model.form.map((field) => field.name)).toEqual(['failed', 'cancelSelf']);
    expect(model.rows.map((row) => row.field.name)).toEqual(['message']);
    expect(model.formValue).toEqual({ failed: true, cancelSelf: false });
  });

  it('gives each row its value and a plain type chip', () => {
    const model = inputsModel(
      kindOf('flow.stop'),
      nodeOf('flow.stop', { message: { wire: { from: 'a', port: 'b' } } }),
    );
    const [row] = model.rows;
    expect(row?.value).toEqual({ wire: { from: 'a', port: 'b' } });
    expect(row?.typeChip).toBe('Text');
  });

  it('gives a trigger its own ports', () => {
    const model = inputsModel(kindOf('trigger.time'), nodeOf('trigger.time'));
    expect(model.rows.length + model.form.length).toBeGreaterThan(0);
  });
});
