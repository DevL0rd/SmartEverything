import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_V4,
  FUNCTION_V4,
  PROGRAM_V4,
  type AutomationV4,
  type GraphNode,
} from '../../src/automation-v3/graph';

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let counter = 0;
function node(key: string, kind: string, extra: Partial<GraphNode> = {}): GraphNode {
  counter += 1;
  return { id: id(counter), key, kind, ...extra };
}

function automation(nodes: readonly GraphNode[]): AutomationV4 {
  return {
    version: 4,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    nodes: [...nodes],
    policy: { mode: 'single' },
  };
}

const finish = node('finish', 'flow.stop');

describe('flat graph program schema', () => {
  it('parses the smallest valid graph', () => {
    const program = automation([node('begin', 'flow.start', { to: { next: 'finish' } }), finish]);
    expect(AUTOMATION_V4.safeParse(program).success).toBe(true);
  });

  it('parses an If with rows, a Switch, a Try and a Do together', () => {
    const program = automation([
      node('begin', 'flow.start', { to: { next: 'choose' } }),
      node('choose', 'flow.if', {
        branches: [{ id: id(900), when: { lit: true }, to: 'lights' }],
        to: { else: 'finish' },
      }),
      node('lights', 'device.set', { to: { next: 'pick' } }),
      node('pick', 'flow.switch', {
        ports: { subject: { lit: 'a' } },
        cases: [{ id: id(901), match: { eq: 'a' }, to: 'guarded' }],
        to: { default: 'finish' },
      }),
      node('guarded', 'flow.try', {
        to: { try: 'attempt', finally: 'cleanup', next: 'fork' },
        catches: [{ id: id(902), classes: ['Unreachable'], to: 'cleanup' }],
      }),
      node('attempt', 'debug.log'),
      node('cleanup', 'debug.log'),
      node('fork', 'flow.parallel', {
        paths: [
          { name: 'left', to: 'meet' },
          { name: 'right', to: 'meet' },
        ],
      }),
      node('meet', 'flow.join', { to: { next: 'finish' } }),
      finish,
    ]);
    const parsed = AUTOMATION_V4.safeParse(program);
    expect(parsed.error?.issues).toBeUndefined();
    expect(parsed.success).toBe(true);
  });

  it('parses a Custom Node graph and picks the right program by kind', () => {
    const fn = {
      version: 4,
      kind: 'function',
      flavour: 'action',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      nodes: [node('begin', 'flow.start', { to: { next: 'back' } }), node('back', 'flow.return')],
    };
    expect(FUNCTION_V4.safeParse(fn).success).toBe(true);
    expect(PROGRAM_V4.safeParse(fn).data?.kind).toBe('function');
    expect(PROGRAM_V4.safeParse(automation([node('begin', 'flow.start')])).data?.kind).toBe(
      'automation',
    );
  });

  it('rejects unknown keys at every level', () => {
    const base = automation([node('begin', 'flow.start')]);
    expect(AUTOMATION_V4.safeParse({ ...base, body: { nodes: [] } }).success).toBe(false);
    expect(AUTOMATION_V4.safeParse({ ...base, onFailure: { nodes: [] } }).success).toBe(false);
    const withExtraNode = { ...base, nodes: [{ ...node('begin', 'flow.start'), scopes: {} }] };
    expect(AUTOMATION_V4.safeParse(withExtraNode).success).toBe(false);
    const withExtraRow = {
      ...base,
      nodes: [
        {
          id: id(950),
          key: 'choose',
          kind: 'flow.if',
          branches: [{ id: id(951), when: { lit: true }, scope: { nodes: [] } }],
        },
      ],
    };
    expect(AUTOMATION_V4.safeParse(withExtraRow).success).toBe(false);
  });

  it('refuses a program of another version', () => {
    const base = automation([node('begin', 'flow.start')]);
    expect(AUTOMATION_V4.safeParse({ ...base, version: 3 }).success).toBe(false);
  });

  it('round-trips through JSON without change', () => {
    const program = automation([
      node('begin', 'flow.start', { to: { next: 'choose' } }),
      node('choose', 'flow.if', {
        branches: [{ id: id(960), when: { lit: true }, to: 'finish' }],
        to: { else: 'finish' },
        label: 'Decide',
      }),
      finish,
    ]);
    const first = AUTOMATION_V4.parse(program);
    const second = AUTOMATION_V4.parse(JSON.parse(JSON.stringify(first)));
    expect(second).toEqual(first);
    expect(second).toEqual(program);
  });
});
