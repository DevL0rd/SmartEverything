import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  PROGRAM_V4,
  graphKit,
  graphNodesOf,
  type AutomationV3,
  type AutomationV4,
  type CatchRow,
  type FlowNode,
  type FunctionV3,
  type GraphPiece,
  type PortValue,
  type SwitchMatch,
} from '@smarteverything/domain';
import { action, kit, lit, wire } from './tree-kit';
import { canonicalise } from '../../src/graph/place-values';
import { structuredOf } from '../../src/graph/structured-of';
import { unstructure } from '../../src/graph/unstructure';

interface Extra<N> {
  readonly scopes?: Record<string, { readonly nodes: N[] }>;
  readonly cases?: { id: string; match: SwitchMatch; scope: { readonly nodes: N[] } }[];
}

interface AnyKit<N> {
  readonly node: (
    key: string,
    kind: string,
    ports?: Record<string, PortValue>,
    extra?: Extra<N>,
  ) => N;
  readonly when: (key: string, condition: PortValue, then: N[], otherwise?: N[]) => N;
  readonly attempt: (key: string, body: N[], classes: CatchRow['classes'], recovery: N[]) => N;
}

type Build = <N>(k: AnyKit<N>) => N[];

const TRIGGER = {
  id: '00000000-0000-4000-8000-ffffffffffff',
  key: 'tick',
  kind: 'trigger.interval',
  ports: { every: lit(60000) },
};

const SWITCH_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_ID = '00000000-0000-4000-8000-0000000000a2';

const chain: Build = (k) => [
  k.node('first', 'device.set', { target: lit({ target: 'hall' }), to: lit(1) }),
  k.node('label', 'text.format', { template: lit('{a}'), a: wire('first', 'sent') }),
  k.node('pause', 'flow.wait', { duration: lit(500) }),
  k.node('done', 'flow.return', { text: wire('label', 'text') }),
];

const decisions: Build = (k) => [
  k.node('check', 'logic.compare', { a: lit(1), op: lit('gt'), b: lit(0) }),
  k.when('plain', wire('check', 'result'), [k.node('on', 'device.set', { to: lit(1) })]),
  k.when(
    'either',
    wire('check', 'result'),
    [k.node('yes', 'device.set', { to: lit(2) })],
    [
      k.node('inner', 'logic.compare', { a: lit(2), op: lit('gt'), b: lit(1) }),
      k.when('deeper', wire('inner', 'result'), [
        k.node('deep', 'debug.log', { message: lit('d') }),
      ]),
      k.node('no', 'device.set', { to: lit(3) }),
    ],
  ),
  k.when('empty', wire('check', 'result'), [], []),
  k.node('after', 'debug.log', { message: lit('after') }),
];

const stops: Build = (k) => [
  k.when('early', lit(true), [k.node('leave', 'flow.return', { exit: lit('done') })]),
  k.node('rest', 'device.set', { to: lit(1) }),
  k.when('gone', lit(false), [], [k.node('halt', 'flow.stop')]),
  k.node('tail', 'debug.log', { message: lit('tail') }),
];

const loops: Build = (k) => [
  k.node('lights', 'device.query', { families: lit(['light']) }),
  k.node(
    'each',
    'flow.for_each',
    { items: wire('lights', 'devices') },
    {
      scopes: {
        body: {
          nodes: [
            k.node('line', 'text.format', { template: lit('{a}'), a: wire('each', 'item') }),
            k.node('note', 'notify.feed', { message: wire('line', 'text') }),
          ],
        },
      },
    },
  ),
  k.node('again', 'flow.repeat', { times: lit(2) }, { scopes: { body: { nodes: [] } } }),
  k.node(
    'nested',
    'flow.repeat',
    { times: lit(3) },
    {
      scopes: {
        body: {
          nodes: [
            k.when('odd', lit(true), [k.node('blink', 'device.set', { to: lit(1) })]),
            k.node('rest', 'flow.wait', { duration: lit(5) }),
          ],
        },
      },
    },
  ),
  k.node('last', 'debug.log', { message: lit('end') }),
];

const attempts: Build = (k) => [
  k.attempt(
    'safe',
    [
      k.node('risky', 'device.set', { to: lit(1) }),
      k.node('next', 'debug.log', { message: lit('a') }),
    ],
    ['Timeout', 'Unreachable'],
    [k.node('sorry', 'notify.feed', { message: lit('failed') })],
  ),
  k.attempt('any', [k.node('also', 'device.set', { to: lit(2) })], undefined, []),
  k.node(
    'loop',
    'flow.repeat',
    { times: lit(2) },
    {
      scopes: {
        body: {
          nodes: [
            k.attempt(
              'inside',
              [k.node('go', 'device.set', { to: lit(3) })],
              ['Failed'],
              [k.node('oops', 'debug.log', { message: lit('o') })],
            ),
          ],
        },
      },
    },
  ),
  k.node('wrap', 'debug.log', { message: lit('wrap') }),
];

const together: Build = (k) => [
  k.node('begin', 'debug.log', { message: lit('b') }),
  k.node('together', 'flow.parallel', undefined, {
    scopes: {
      lights: { nodes: [k.node('flash', 'device.set', { to: lit(1) })] },
      pause: {
        nodes: [
          k.node('playing', 'logic.compare', { a: lit(1), op: lit('gt'), b: lit(0) }),
          k.when('check', wire('playing', 'result'), [
            k.node('stop', 'device.set', { to: lit(0) }),
          ]),
          k.node('guarded', 'flow.guard', { condition: lit(true), quietly: lit(true) }),
          k.node('late', 'debug.log', { message: lit('l') }),
        ],
      },
      idle: { nodes: [] },
    },
  }),
  k.node('restore', 'device.set', { to: lit(9) }),
  k.node('inner', 'flow.parallel', undefined, {
    scopes: {
      a: { nodes: [k.node('one', 'debug.log', { message: lit('1') })] },
      b: { nodes: [k.node('two', 'debug.log', { message: lit('2') })] },
    },
  }),
];

const choices: Build = (k) => [
  k.node(
    'pick',
    'flow.switch',
    { subject: lit(2) },
    {
      cases: [
        {
          id: SWITCH_ID,
          match: { eq: 1 },
          scope: { nodes: [k.node('one', 'device.set', { to: lit(1) })] },
        },
        { id: OTHER_ID, match: { eq: 2 }, scope: { nodes: [] } },
      ],
      scopes: { default: { nodes: [k.node('other', 'device.set', { to: lit(0) })] } },
    },
  ),
  k.node(
    'cool',
    'timing.cooldown',
    { duration: lit(1000) },
    {
      scopes: { blocked: { nodes: [k.node('skipped', 'debug.log', { message: lit('s') })] } },
    },
  ),
  k.node('free', 'timing.cooldown', { duration: lit(1000) }),
  k.node('finish', 'debug.log', { message: lit('f') }),
];

const PROGRAMS: Readonly<Record<string, Build>> = {
  chain,
  decisions,
  stops,
  loops,
  attempts,
  together,
  choices,
};

function oldTree(build: Build): AutomationV3 {
  const nodes: FlowNode[] = build(kit(1));
  return {
    version: 3,
    kind: 'automation',
    triggers: [TRIGGER],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes },
    policy: { mode: 'single' },
  };
}

function newGraph(build: Build): AutomationV4 {
  const pieces: GraphPiece[] = build(graphKit(1));
  return {
    version: 4,
    kind: 'automation',
    triggers: [TRIGGER],
    inputs: [],
    outputs: [],
    variables: [],
    nodes: graphNodesOf(pieces, [TRIGGER.key]),
    policy: { mode: 'single' },
  };
}

describe('the graph builder kit', () => {
  for (const [name, build] of Object.entries(PROGRAMS)) {
    it(`builds ${name} as the graph of the old tree`, () => {
      const graph = newGraph(build);
      expect(PROGRAM_V4.safeParse(graph).success).toBe(true);
      expect(graph).toEqual(unstructure(oldTree(build), STATIC_KIND_LOOKUP));
    });

    it(`structures ${name} back to the canonical old tree`, () => {
      const structured = structuredOf(newGraph(build), STATIC_KIND_LOOKUP);
      if (structured.kind !== 'structured') {
        throw new Error(structured.problems.map((problem) => problem.message).join(' | '));
      }
      expect(structured.tree).toEqual(canonicalise(oldTree(build), STATIC_KIND_LOOKUP));
    });
  }

  it('builds an action function the same way', () => {
    const shape = { description: 'Flashes.', category: 'lights', icon: 'bell' };
    const old: FunctionV3 = action(shape, decisions(kit(2)));
    const { body: _body, ...frame } = old;
    const graph = { ...frame, version: 4 as const, nodes: graphNodesOf(decisions(graphKit(2))) };
    expect(PROGRAM_V4.safeParse(graph).success).toBe(true);
    expect(graph).toEqual(unstructure(old, STATIC_KIND_LOOKUP));
  });

  it('is deterministic', () => {
    expect(newGraph(together)).toEqual(newGraph(together));
  });
});
