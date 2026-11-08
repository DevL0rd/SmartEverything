import { describe, expect, it } from 'vitest';
import type { FlowNode, NodeKind } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { deviceListOf, deviceListValue, inputOps, inputsModel, ownedPorts } from './inputs-model';

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
  });
});

describe('inputsModel', () => {
  it('marks plain static options as form rows and keeps the kind order', () => {
    const model = inputsModel(kindOf('flow.stop'), nodeOf('flow.stop', { failed: { lit: true } }));
    expect(model.rows.map((row) => [row.field.name, row.form])).toEqual([
      ['message', false],
      ['failed', true],
      ['cancelSelf', true],
    ]);
  });

  it('puts Change device inputs in the order Target, Control, To with Control as a picker', () => {
    const model = inputsModel(kindOf('device.set'), nodeOf('device.set'));
    const main = model.rows.filter((row) => row.main);
    expect(main.map((row) => row.field.name)).toEqual(['target', 'control', 'to']);
    expect(main[1]?.source).toBe('device.writable_controls');
    expect(main[1]?.form).toBe(false);
    expect(model.rows.filter((row) => !row.main).map((row) => row.field.title)).toEqual([
      'Change by',
      'Use percent',
      'Fade over',
      'Every device must answer',
    ]);
  });

  it('moves trigger timing options out of the inputs and shows the camera first', () => {
    const kind = kindOf('trigger.camera');
    const node = nodeOf('trigger.camera');
    const inputs = inputsModel(kind, node).rows;
    expect(inputs.map((row) => [row.field.name, row.main])).toEqual([
      ['camera', true],
      ['detection', true],
    ]);
    expect(inputsModel(kind, node, 'timing').rows.map((row) => row.field.title)).toContain(
      'Ignore repeats for',
    );
  });

  it('reads a For each list of devices as one device list and writes it back', () => {
    const kind = kindOf('flow.for_each');
    const items = { lit: [{ device: 'd1' }, { device: 'd2' }] };
    const [row] = inputsModel(kind, nodeOf('flow.for_each', { items })).rows;
    expect(row === undefined ? undefined : deviceListOf(kind, row)).toEqual(['d1', 'd2']);
    expect(deviceListValue({ devices: ['d1'] })).toEqual([{ device: 'd1' }]);
    const mixed = inputsModel(kind, nodeOf('flow.for_each', { items: { lit: [1, 2] } })).rows[0];
    expect(mixed === undefined ? 'none' : deviceListOf(kind, mixed)).toBeUndefined();
  });

  it('gives each row its value and a plain type chip', () => {
    const model = inputsModel(
      kindOf('flow.stop'),
      nodeOf('flow.stop', { message: { wire: { from: 'a', port: 'b' } } }),
    );
    const [row] = model.rows;
    expect(row?.value).toEqual({ wire: { from: 'a', port: 'b' } });
    expect(row?.typeChip).toBe('');
  });

  it('gives a trigger its own ports', () => {
    const model = inputsModel(kindOf('trigger.time'), nodeOf('trigger.time'));
    expect(model.rows.length).toBeGreaterThan(0);
  });
});

describe('inputOps', () => {
  it('clears the picked button when the remote changes', () => {
    const kind = kindOf('device.ir_send');
    const node = nodeOf('device.ir_send', { remote: { lit: 'tv' }, button: { lit: 'power' } });
    expect(inputOps({ key: 'a', kind, node }, 'remote', { lit: 'fan' })).toEqual([
      { op: 'set', key: 'a', ports: { remote: { lit: 'fan' } } },
      { op: 'unset', key: 'a', ports: ['button'] },
    ]);
    expect(inputOps({ key: 'a', kind, node }, 'button', { lit: 'mute' })).toEqual([
      { op: 'set', key: 'a', ports: { button: { lit: 'mute' } } },
    ]);
  });
});
