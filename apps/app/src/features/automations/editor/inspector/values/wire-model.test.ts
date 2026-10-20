import { describe, expect, it } from 'vitest';
import type { AutomationV3, FlowNode, FlowType } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { checkVisibility } from '@smarteverything/flow/check/visibility';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import {
  Ids,
  add,
  automation,
  ifNode,
  scope,
  setLight,
} from '../../../model/canvas/canvas-fixtures';
import { currentWire, wireGroups, wireValue } from './wire-model';

interface Built {
  readonly program: AutomationV3;
  readonly owner: string;
  readonly first: string;
  readonly later: string;
  readonly inner: string;
}

function build(expr: string | null): Built {
  const ids = new Ids();
  const first: FlowNode = { ...add(ids, null), kind: 'math.round' };
  const inner = setLight(ids, expr);
  const later = add(ids, null);
  const outerSet = setLight(ids, null);
  const branch = ifNode(ids, [scope([inner])]);
  const program = automation([first, branch, later, outerSet]);
  return { program, owner: inner.key, first: first.key, later: later.key, inner: outerSet.key };
}

function groupsFor(built: Built, expected: FlowType | undefined): readonly string[] {
  return wireGroups({
    index: indexProgram(built.program),
    registry: NODE_REGISTRY,
    ownerKey: built.owner,
    expected,
  }).map((group) => group.root);
}

describe('wireGroups visibility', () => {
  it('offers earlier steps, the trigger and value steps, never the step itself', () => {
    const built = build(null);
    const roots = groupsFor(built, undefined);
    expect(roots).toContain(built.first);
    expect(roots).toContain('t0');
    expect(roots).toContain(built.later);
    expect(roots).not.toContain(built.owner);
  });

  it('agrees with the visibility check for every offered reference', () => {
    const probe = build(null);
    const index = indexProgram(probe.program);
    const offered = wireGroups({
      index,
      registry: NODE_REGISTRY,
      ownerKey: probe.owner,
      expected: undefined,
    }).flatMap((group) => group.choices.map((choice) => choice.ref));
    expect(offered.length).toBeGreaterThan(0);
    for (const ref of offered) {
      const built = build(ref);
      const report = checkVisibility(indexProgram(built.program), {
        classOf: (kind) => NODE_REGISTRY.get(kind)?.class,
        outputsOf: (kind) => NODE_REGISTRY.get(kind)?.outputs ?? [],
      });
      expect(report.problems.map((found) => found.message)).toEqual([]);
    }
  });
});

describe('wireGroups types', () => {
  it('drops outputs that cannot fit and have no conversion', () => {
    const built = build(null);
    expect(groupsFor(built, { t: 'text' })).not.toContain(built.first);
  });

  it('names the conversion node when one exists', () => {
    const built = build(null);
    const [group] = wireGroups({
      index: indexProgram(built.program),
      registry: NODE_REGISTRY,
      ownerKey: built.owner,
      expected: { t: 'duration' },
    }).filter((candidate) => candidate.root === built.first);
    const choice = group?.choices[0];
    expect(choice?.hint).toMatch(/Convert/);
    expect(choice === undefined ? null : wireValue(choice)).toEqual({
      wire: { from: built.first, port: 'result' },
    });
  });
});

describe('currentWire', () => {
  it('reads a single reference and nothing else', () => {
    expect(currentWire({ wire: { from: 'a', port: 'result' } })).toEqual({
      from: 'a',
      port: 'result',
    });
    expect(currentWire({ lit: 1 })).toBeUndefined();
  });
});

describe('helpers stay typed', () => {
  it('uses plain nodes', () => {
    const node: FlowNode = add(new Ids(), null);
    expect(node.kind).toBe('math.add');
  });
});
