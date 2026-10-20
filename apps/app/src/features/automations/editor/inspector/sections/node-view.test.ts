import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import {
  Ids,
  automation,
  ifNode,
  scope,
  setLight,
  timeTrigger,
} from '../../../model/canvas/canvas-fixtures';
import { DESCRIBE, viewByKey } from './inspector-fixtures';
import { badgeOf, enclosingLoops, flowNodeOf, nodeView, triggerOf } from './node-view';
import { wireScopeOf } from '@smarteverything/domain';

function loopProgram(): {
  readonly program: ReturnType<typeof automation>;
  readonly leave: string;
} {
  const ids = new Ids();
  const leave: FlowNode = { ...ids.next(), kind: 'flow.break' };
  const inner: FlowNode = {
    ...ids.next(),
    kind: 'flow.for_each',
    ports: { items: { lit: [1, 2] } },
    scopes: { body: scope([ifNode(ids, [scope([leave])])]) },
  };
  const outer: FlowNode = {
    ...ids.next(),
    kind: 'flow.repeat',
    label: 'Every room',
    ports: { times: { lit: 3 } },
    scopes: { body: scope([setLight(ids, null), inner]) },
  };
  return { program: automation([outer]), leave: leave.key };
}

describe('badgeOf', () => {
  it('names the class of each kind in words', () => {
    const cases: readonly [string, string][] = [
      ['trigger.time', 'Trigger'],
      ['math.add', 'Value'],
      ['flow.if', 'Block'],
      ['device.set', 'Step'],
      ['fn.call', 'Custom Node'],
      ['made.up', 'Step'],
    ];
    for (const [id, badge] of cases) expect(badgeOf(id, NODE_REGISTRY.get(id))).toBe(badge);
  });
});

describe('nodeView', () => {
  const ids = new Ids();
  const light = setLight(ids, null, { label: 'Dim the lamp' });
  const program = automation([light, setLight(ids, null)]);
  const index = indexProgram(program);

  it('finds a body node and uses its label as the title', () => {
    const view = nodeView(index, light.id, NODE_REGISTRY);
    expect(view?.key).toBe(light.key);
    expect(view?.title).toBe('Dim the lamp');
    expect(view?.badge).toBe('Step');
    expect(view === undefined ? undefined : flowNodeOf(view)?.id).toBe(light.id);
    expect(view === undefined ? undefined : triggerOf(view)).toBeUndefined();
  });

  it('falls back to the kind name when there is no label', () => {
    const second = program.body.nodes[1];
    const view = second === undefined ? undefined : nodeView(index, second.id, NODE_REGISTRY);
    expect(view?.title).toBe(NODE_REGISTRY.get('device.set')?.name);
  });

  it('finds a trigger and gives it the trigger badge', () => {
    const trigger = timeTrigger(0);
    const view = nodeView(index, trigger.id, NODE_REGISTRY);
    expect(view?.badge).toBe('Trigger');
    expect(view === undefined ? undefined : triggerOf(view)?.key).toBe(trigger.key);
    expect(view === undefined ? undefined : flowNodeOf(view)).toBeUndefined();
  });

  it('answers undefined for an id that is not in the program', () => {
    expect(nodeView(index, '00000000-0000-4000-8000-ffffffffffff', NODE_REGISTRY)).toBeUndefined();
  });
});

describe('enclosingLoops', () => {
  it('lists the loops around a step, innermost first, and skips other blocks', () => {
    const { program, leave } = loopProgram();
    const view = viewByKey(program, leave);
    const loops = enclosingLoops(
      indexProgram(program),
      view,
      DESCRIBE,
      wireScopeOf(program, DESCRIBE),
    );
    expect(loops.map((loop) => loop.innermost)).toEqual([true, false]);
    expect(loops.map((loop) => loop.label)).toEqual(['For each of 1, 2', 'Repeat 3 times']);
  });

  it('answers nothing for a trigger or a step outside any loop', () => {
    const ids = new Ids();
    const program = automation([setLight(ids, null)]);
    const scopeOf = wireScopeOf(program, DESCRIBE);
    const step = viewByKey(program, 'n1');
    expect(enclosingLoops(indexProgram(program), step, DESCRIBE, scopeOf)).toEqual([]);
    const trigger = viewByKey(program, 't0');
    expect(enclosingLoops(indexProgram(program), trigger, DESCRIBE, scopeOf)).toEqual([]);
  });
});
