import type { AutomationV3, FlowNode, PortValue } from '@smarteverything/domain';
import fc from 'fast-check';
import type { Program } from '../../src/program/walk';
import { describe, expect, it } from 'vitest';
import { automation, detached, wired, extracted, lit, probe, pure, withPress } from './support';

interface Step {
  readonly reads: number;
  readonly subject: boolean;
  readonly feeder: boolean;
}

const steps = fc.array(
  fc.record({ reads: fc.nat(20), subject: fc.boolean(), feeder: fc.boolean() }),
  { minLength: 2, maxLength: 7 },
);

function build(plan: readonly Step[]): AutomationV3 {
  const nodes: FlowNode[] = plan.flatMap((step, position) => {
    const ports: Record<string, PortValue> = {};
    if (position > 0 && step.reads % 3 !== 0) {
      ports['count'] = wired(`s${String(step.reads % position)}.out`);
    }
    if (step.subject) ports['label'] = wired('trigger.subject');
    if (step.feeder) ports['wait'] = wired(`f${String(position)}.result`);
    const feeder = step.feeder ? [pure(`f${String(position)}`)] : [];
    return [...feeder, probe(`s${String(position)}`, { ...ports, fixed: lit('x') })];
  });
  return withPress(automation(nodes));
}

describe('extract then detach', () => {
  it('gives back the same program for every window of steps', () => {
    fc.assert(
      fc.property(steps, fc.nat(20), fc.nat(20), (plan, from, span) => {
        const program = build(plan);
        const first = from % plan.length;
        const last = Math.min(plan.length - 1, first + (span % plan.length));
        const selection = plan
          .slice(first, last + 1)
          .map((_, offset) => `s${String(first + offset)}`);
        const { caller, callee, instanceKey } = extracted(program, selection);
        expect(callee.flavour).toBe('action');
        const back = detached(caller, instanceKey, callee);
        const order = (value: Program): string[] =>
          value.body.nodes.filter((node) => node.kind === 'probe.take').map((node) => node.key);
        expect(order(back)).toEqual(order(program));
        const byKey = (value: Program): Record<string, FlowNode> =>
          Object.fromEntries(value.body.nodes.map((node) => [node.key, node]));
        expect(byKey(back)).toEqual(byKey(program));
      }),
      { numRuns: 200 },
    );
  });
});
