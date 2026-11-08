import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP, type GraphNode, type ProgramV4 } from '@smarteverything/domain';
import { kindLookupOf } from '../../../data/kind-lookup';
import {
  automation,
  gnode,
  join,
  note,
  start,
  together,
} from '../../../model/graph/graph-scene-fixtures';
import { PING_KIND_ID, kindRow } from '../../../../../test-support/plugin-kinds';
import { joinOptionsOf, pathsOf } from './graph-paths-model';
import { reservedOutputNames } from './graph-values-after-model';
import { describeOf } from './inspector-fixtures';

const LOOKUP = kindLookupOf([kindRow()]);

function program(): ProgramV4 {
  return automation([
    start('both'),
    together('both', [
      { name: 'left', to: 'ping' },
      { name: 'right', to: 'meet' },
    ]),
    gnode('ping', PING_KIND_ID, { ports: { target: { lit: 'kitchen' } }, to: { next: 'meet' } }),
    join('meet', 'after'),
    note('after'),
  ]);
}

function nodeOf(source: ProgramV4, key: string): GraphNode {
  const found = source.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no node ${key}`);
  return found;
}

describe('the graph section models with plugin kinds', () => {
  it('names a plugin step by its declared name on a path', () => {
    const source = program();
    const model = pathsOf(source, nodeOf(source, 'both'), LOOKUP);
    expect(model?.rows[0]?.text).toBe('Starts with Ping the demo');
    expect(pathsOf(source, nodeOf(source, 'both'), STATIC_KIND_LOOKUP)?.rows[0]?.text).toBe(
      'Starts with ping',
    );
  });

  it('reads the fork options through the lookup', () => {
    const source = program();
    const options = joinOptionsOf(source, nodeOf(source, 'both'), LOOKUP);
    expect(options?.joinChoices.length).toBeGreaterThan(0);
    expect(options?.forkName).toBe('Do together');
  });

  it('keeps the declared outputs of a plugin step reserved', () => {
    const ping = nodeOf(program(), 'ping');
    expect(reservedOutputNames(ping, LOOKUP)).toEqual(['reply']);
    expect(reservedOutputNames(ping, STATIC_KIND_LOOKUP)).toEqual([]);
  });

  it('describes a plugin step in the inspector fixtures', () => {
    expect(describeOf(LOOKUP).kinds(PING_KIND_ID)?.name).toBe('Ping the demo');
  });
});
