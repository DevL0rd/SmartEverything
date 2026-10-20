import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import {
  Ids,
  add,
  automation,
  ifNode,
  scope,
  setLight,
} from '../../../model/canvas/canvas-fixtures';
import { outputRows, usedByCount } from './outputs-model';

describe('usedByCount', () => {
  const ids = new Ids();
  const first = add(ids, null);
  const second = add(ids, `${first.key}.sum`);
  const third = setLight(ids, `${first.key}.sum`);
  const fourth = setLight(ids, `${first.key}.other`);
  const program = automation([first, second, third, fourth]);
  const index = indexProgram(program);

  it('counts the places that read one output', () => {
    expect(usedByCount(index, first.key, 'sum')).toBe(2);
    expect(usedByCount(index, first.key, 'other')).toBe(1);
    expect(usedByCount(index, first.key, 'missing')).toBe(0);
  });

  it('does not count the step reading its own key or other steps', () => {
    expect(usedByCount(index, second.key, 'sum')).toBe(0);
  });

  it('counts a condition inside an If', () => {
    const flags = new Ids(50);
    const source = add(flags, null);
    const branch = ifNode(flags, [scope([])], undefined, {});
    const withWhen = {
      ...branch,
      branches: branch.branches?.map((row) => ({
        ...row,
        when: { wire: { from: source.key, port: 'sum' } },
      })),
    };
    expect(usedByCount(indexProgram(automation([source, withWhen])), source.key, 'sum')).toBe(1);
  });
});

describe('outputRows', () => {
  const ids = new Ids();
  const node = add(ids, null);
  const index = indexProgram(automation([node]));
  const kind = NODE_REGISTRY.get('math.add');

  it('lists each output with a label, a type chip and the text a person copies', () => {
    if (kind === undefined) throw new Error('no math.add');
    const rows = outputRows(index, kind, node.key, undefined);
    expect(rows.map((row) => row.name)).toEqual(kind.outputs.map((out) => out.name));
    expect(rows[0]?.reference).toBe(`${node.key}.${kind.outputs[0]?.name ?? ''}`);
    expect(rows[0]?.preview).toBeNull();
  });

  it('shows the value of the last run and nothing for outputs it did not give', () => {
    if (kind === undefined) throw new Error('no math.add');
    const name = kind.outputs[0]?.name ?? '';
    const rows = outputRows(index, kind, node.key, { [name]: 42 });
    expect(rows[0]?.preview).toBe('42');
    expect(outputRows(index, kind, node.key, { other: 1 })[0]?.preview).toBeNull();
    expect(outputRows(index, kind, node.key, [1, 2])[0]?.preview).toBeNull();
    expect(outputRows(index, kind, node.key, { [name]: 'text' })[0]?.preview).toBe('text');
  });

  it('marks outputs that exist only sometimes', () => {
    const forEach = NODE_REGISTRY.get('flow.for_each');
    if (forEach === undefined) throw new Error('no flow.for_each');
    const rows = outputRows(index, forEach, 'x', undefined);
    expect(rows.find((row) => row.name === 'results')?.optional).toBe(true);
  });
});
