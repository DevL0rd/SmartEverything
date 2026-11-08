import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { AUTOMATION_V4, type AutomationV3, type AutomationV4 } from '@smarteverything/domain';
import { canonicalise } from '@smarteverything/flow/graph/place-values';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import { describe, expect, it } from 'vitest';
import { automation, lit, maker, wire, type Maker } from './build';
import { graphAutomation, graphMaker, type GraphMaker } from './graph-kit';

interface Pair {
  readonly old: Maker;
  readonly next: GraphMaker;
}

function sample<N>(m: {
  readonly node: (
    key: string,
    kind: string,
    ports?: Record<string, ReturnType<typeof lit>>,
    extra?: { readonly scopes?: Record<string, { readonly nodes: N[] }> },
  ) => N;
  readonly when: (key: string, condition: ReturnType<typeof lit>, then: N[], otherwise?: N[]) => N;
  readonly attempt: (key: string, body: N[], classes: ['Failed'], recovery: N[]) => N;
}): N[] {
  return [
    m.node('lights', 'device.query', { families: lit(['light']) }),
    m.node(
      'each',
      'flow.for_each',
      { items: wire('lights', 'devices') },
      {
        scopes: {
          body: {
            nodes: [
              m.node('line', 'text.format', { template: lit('{a}'), a: wire('each', 'item') }),
              m.node('note', 'notify.feed', { message: wire('line', 'text') }),
            ],
          },
        },
      },
    ),
    m.node('together', 'flow.parallel', undefined, {
      scopes: {
        on: { nodes: [m.node('lamp', 'device.set', { to: lit(1) })] },
        note: {
          nodes: [
            m.when('ask', lit(true), [m.node('hello', 'notify.feed', { message: lit('hi') })]),
          ],
        },
      },
    }),
    m.attempt(
      'safe',
      [m.node('risky', 'device.set', { to: lit(0) })],
      ['Failed'],
      [m.node('sorry', 'notify.feed', { message: lit('failed') })],
    ),
  ];
}

function pair(): Pair {
  return { old: maker('graph-kit-test'), next: graphMaker('graph-kit-test') };
}

function oldProgram(p: Pair): AutomationV3 {
  return automation({
    triggers: [p.old.trigger('clock', 'trigger.interval', { every: lit(60000) })],
    body: sample(p.old),
  });
}

function newProgram(p: Pair): AutomationV4 {
  return graphAutomation({
    triggers: [p.next.trigger('clock', 'trigger.interval', { every: lit(60000) })],
    body: sample(p.next),
  });
}

describe('the template graph maker', () => {
  it('builds the graph of what the old maker builds, with the same ids', () => {
    const graph = newProgram(pair());
    expect(AUTOMATION_V4.safeParse(graph).success).toBe(true);
    expect(graph).toEqual(unstructure(oldProgram(pair()), STATIC_KIND_LOOKUP));
  });

  it('structures back to the old tree', () => {
    const structured = structuredOf(newProgram(pair()), STATIC_KIND_LOOKUP);
    if (structured.kind !== 'structured') throw new Error('did not structure');
    expect(structured.tree).toEqual(canonicalise(oldProgram(pair()), STATIC_KIND_LOOKUP));
  });

  it('builds the same program every time', () => {
    expect(newProgram(pair())).toEqual(newProgram(pair()));
  });

  it('keeps the options of the program', () => {
    const m = graphMaker('options');
    const graph = graphAutomation({
      description: 'Shows the options.',
      triggers: [m.trigger('clock', 'trigger.interval', { every: lit(1000) })],
      admit: lit(true),
      mode: 'restart',
      body: [m.node('hello', 'notify.feed', { message: lit('hi') })],
    });
    expect(graph.description).toBe('Shows the options.');
    expect(graph.admit).toEqual(lit(true));
    expect(graph.policy).toEqual({ mode: 'restart' });
  });
});
