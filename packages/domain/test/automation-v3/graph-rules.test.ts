import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { AUTOMATION_V4, FUNCTION_V4, type GraphNode } from '../../src/automation-v3/graph';
import {
  graphRuleIssues,
  type GraphRuleCode,
  type GraphRuleProgram,
} from '../../src/automation-v3/graph-rules';

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let counter = 100;
let rowCounter = 5000;

function freshId(): string {
  rowCounter += 1;
  return id(rowCounter);
}

function node(key: string, kind: string, extra: Partial<GraphNode> = {}): GraphNode {
  counter += 1;
  return { id: id(counter), key, kind, ...extra };
}

const begin = (): GraphNode => node('begin', 'flow.start', { to: { next: 'finish' } });
const finish = (): GraphNode => node('finish', 'flow.stop');

function automation(
  nodes: readonly GraphNode[],
  extra: Partial<Extract<GraphRuleProgram, { kind: 'automation' }>> = {},
): GraphRuleProgram {
  return {
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    policy: { mode: 'single' },
    nodes,
    ...extra,
  };
}

function custom(nodes: readonly GraphNode[]): GraphRuleProgram {
  return {
    kind: 'function',
    flavour: 'action',
    inputs: [],
    outputs: [],
    exits: ['done'],
    variables: [],
    nodes,
  };
}

function codes(program: GraphRuleProgram): readonly GraphRuleCode[] {
  return graphRuleIssues(program, STATIC_KIND_LOOKUP).map((found) => found.code);
}

describe('static graph rules', () => {
  it('accepts a valid minimal graph', () => {
    expect(graphRuleIssues(automation([begin(), finish()]), STATIC_KIND_LOOKUP)).toEqual([]);
    expect(graphRuleIssues(custom([begin(), finish()]), STATIC_KIND_LOOKUP)).toEqual([]);
  });

  it('refuses duplicate node ids and keys, and a key shared with a trigger', () => {
    const first = begin();
    const sameId = node('other', 'flow.stop', { id: first.id });
    expect(codes(automation([first, finish(), sameId]))).toContain('duplicate_id');
    expect(codes(automation([begin(), finish(), node('finish', 'flow.stop')]))).toContain(
      'duplicate_key',
    );
    const trigger = { id: id(1), key: 'finish', kind: 'trigger.time', ports: {} };
    expect(codes(automation([begin(), finish()], { triggers: [trigger] }))).toContain(
      'duplicate_key',
    );
    expect(
      codes(automation([begin(), finish()], { triggers: [{ ...trigger, key: 'tick' }] })),
    ).toEqual([]);
  });

  it('refuses duplicate row ids across nodes', () => {
    const row = { id: id(7), when: { lit: true } };
    const first = node('one', 'flow.if', { branches: [row] });
    const second = node('two', 'flow.if', { branches: [row] });
    expect(codes(automation([begin(), finish(), first, second]))).toContain('duplicate_id');
  });

  it('refuses a target that names no node', () => {
    const program = automation([
      node('begin', 'flow.start', { to: { next: 'missing' } }),
      finish(),
    ]);
    expect(codes(program)).toEqual(['unknown_target']);
    const rowTarget = node('choose', 'flow.if', {
      branches: [{ id: id(8), when: { lit: true }, to: 'missing' }],
    });
    expect(codes(automation([begin(), finish(), rowTarget]))).toEqual(['unknown_target']);
  });

  it('refuses a target that is a value card', () => {
    const program = automation([
      node('begin', 'flow.start', { to: { next: 'reading' } }),
      node('reading', 'device.get'),
    ]);
    expect(codes(program)).toEqual(['target_not_exec']);
  });

  it('refuses an exit the kind does not declare', () => {
    const wrongName = node('begin', 'flow.start', { to: { next: 'finish', else: 'finish' } });
    expect(codes(automation([wrongName, finish()]))).toEqual(['undeclared_port']);
    const onTerminal = node('finish', 'flow.stop', { to: { next: 'begin' } });
    expect(codes(automation([begin(), onTerminal]))).toEqual([
      'undeclared_port',
      'wire_into_start',
    ]);
    const onValue = node('reading', 'device.get', { to: { next: 'finish' } });
    expect(codes(automation([begin(), finish(), onValue]))).toEqual(['undeclared_port']);
  });

  it('shows the declared exits in the message', () => {
    const bad = node('begin', 'flow.start', { to: { next: 'finish', body: 'finish' } });
    const [found] = graphRuleIssues(automation([bad, finish()]), STATIC_KIND_LOOKUP);
    expect(found?.message).toContain('"begin"');
    expect(found?.message).toContain('"body"');
    expect(found?.message).toContain('next');
  });

  it('refuses a timed out exit on a wait without a timeout and a Then on Do together', () => {
    const wait = node('wait', 'flow.wait_event', { to: { next: 'finish', timedOut: 'finish' } });
    expect(codes(automation([begin(), finish(), wait]))).toEqual(['undeclared_port']);
    const timed = node('wait', 'flow.wait_event', {
      ports: { timeout: { lit: 1000 } },
      to: { next: 'finish', timedOut: 'finish' },
    });
    expect(codes(automation([begin(), finish(), timed]))).toEqual([]);
    const fork = node('fork', 'flow.parallel', {
      paths: [{ name: 'a' }, { name: 'b' }],
      to: { next: 'finish' },
    });
    expect(codes(automation([begin(), finish(), fork]))).toEqual(['undeclared_port']);
  });

  it('refuses no Start and two Starts', () => {
    expect(codes(automation([finish()]))).toEqual(['start_count']);
    expect(codes(automation([begin(), node('again', 'flow.start'), finish()]))).toEqual([
      'start_count',
    ]);
  });

  it('allows one On failure in an automation, refuses two and any in a Custom Node', () => {
    const handler = (key: string): GraphNode => node(key, 'flow.on_failure');
    expect(codes(automation([begin(), finish(), handler('oops')]))).toEqual([]);
    expect(codes(automation([begin(), finish(), handler('oops'), handler('oops2')]))).toEqual([
      'failure_count',
    ]);
    expect(codes(custom([begin(), finish(), handler('oops')]))).toEqual(['failure_count']);
  });

  it('refuses wires into Start and On failure', () => {
    const toStart = node('step', 'debug.log', { to: { next: 'begin' } });
    expect(codes(automation([begin(), finish(), toStart]))).toEqual(['wire_into_start']);
    const handler = node('oops', 'flow.on_failure');
    const toHandler = node('step', 'debug.log', { to: { next: 'oops' } });
    expect(codes(automation([begin(), finish(), handler, toHandler]))).toEqual(['wire_into_start']);
  });

  it('keeps rows on their own kinds', () => {
    const branches = (): NonNullable<GraphNode['branches']> => [
      { id: freshId(), when: { lit: true } },
    ];
    const cases = (): NonNullable<GraphNode['cases']> => [{ id: freshId(), match: { eq: 1 } }];
    const catches = (): NonNullable<GraphNode['catches']> => [{ id: freshId() }];
    const paths = (): NonNullable<GraphNode['paths']> => [{ name: 'a' }, { name: 'b' }];
    const wrong = [
      node('w1', 'debug.log', { branches: branches() }),
      node('w2', 'flow.if', { branches: branches(), cases: cases() }),
      node('w3', 'flow.if', { branches: branches(), catches: catches() }),
      node('w4', 'debug.log', { paths: paths() }),
    ];
    expect(codes(automation([begin(), finish(), ...wrong]))).toEqual([
      'rows_on_wrong_kind',
      'rows_on_wrong_kind',
      'rows_on_wrong_kind',
      'rows_on_wrong_kind',
    ]);
    const right = [
      node('r1', 'flow.if', { branches: branches() }),
      node('r2', 'flow.switch', { cases: cases() }),
      node('r3', 'flow.try', { catches: catches() }),
      node('r4', 'flow.parallel', { paths: paths() }),
    ];
    expect(codes(automation([begin(), finish(), ...right]))).toEqual([]);
  });

  it('needs the rows its kind is built on', () => {
    const missing = [node('m1', 'flow.if'), node('m2', 'flow.switch')];
    expect(codes(automation([begin(), finish(), ...missing]))).toEqual([
      'rows_missing',
      'rows_missing',
    ]);
  });

  it('needs two or more paths with unique names, never onError', () => {
    const one = node('fork', 'flow.parallel', { paths: [{ name: 'a' }] });
    expect(codes(automation([begin(), finish(), one]))).toEqual(['paths_too_few']);
    const none = node('fork', 'flow.parallel');
    expect(codes(automation([begin(), finish(), none]))).toEqual(['paths_too_few']);
    const same = node('fork', 'flow.parallel', { paths: [{ name: 'a' }, { name: 'a' }] });
    expect(codes(automation([begin(), finish(), same]))).toEqual(['path_name_duplicate']);
    const reserved = node('fork', 'flow.parallel', { paths: [{ name: 'a' }, { name: 'onError' }] });
    expect(codes(automation([begin(), finish(), reserved]))).toEqual(['path_name_reserved']);
    const fine = node('fork', 'flow.parallel', { paths: [{ name: 'a' }, { name: 'b' }] });
    expect(codes(automation([begin(), finish(), fine]))).toEqual([]);
  });

  it('allows routing errors on steps and refuses it on control kinds', () => {
    const policy = { onError: 'route' } as const;
    const step = node('lights', 'device.set', { policy, to: { onError: 'finish' } });
    expect(codes(automation([begin(), finish(), step]))).toEqual([]);
    for (const kind of ['flow.guard', 'flow.for_each', 'flow.join', 'flow.try']) {
      const control = node('control', kind, { policy });
      expect(codes(automation([begin(), finish(), control])), kind).toContain('route_on_control');
    }
    const branches = [{ id: id(50), when: { lit: true } }];
    const decision = node('choose', 'flow.if', { branches, policy });
    expect(codes(automation([begin(), finish(), decision]))).toEqual(['route_on_control']);
  });

  it('accepts a wired If it fails exit on a fallible step and refuses it where nothing can fail', () => {
    const wired = node('lights', 'device.set', { to: { onError: 'finish' } });
    expect(codes(automation([begin(), finish(), wired]))).toEqual([]);
    const log = node('log', 'debug.log', { to: { onError: 'finish' } });
    expect(codes(automation([begin(), finish(), log]))).toEqual(['error_exit_on_infallible']);
    const routedLog = node('log', 'debug.log', { policy: { onError: 'route' } });
    expect(codes(automation([begin(), finish(), routedLog]))).toEqual(['error_exit_on_infallible']);
    const guard = node('gate', 'flow.guard', { to: { onError: 'finish' } });
    expect(codes(automation([begin(), finish(), guard]))).toEqual(['undeclared_port']);
  });

  it('refuses a memory node inside a Custom Node but not an automation', () => {
    const memory = node('cool', 'timing.cooldown');
    expect(codes(custom([begin(), finish(), memory]))).toEqual(['memory_in_function']);
    expect(codes(automation([begin(), finish(), memory]))).toEqual([]);
  });

  it('refuses Steps (flow.sequence) with a named code', () => {
    const steps = node('group', 'flow.sequence', { to: { body: 'finish' } });
    const found = graphRuleIssues(automation([begin(), finish(), steps]), STATIC_KIND_LOOKUP);
    expect(found.map((one) => one.code)).toContain('sequence_removed');
    expect(found.find((one) => one.code === 'sequence_removed')?.message).toContain('"group"');
  });

  it('refuses a trigger kind among the nodes', () => {
    expect(codes(automation([begin(), finish(), node('tick', 'trigger.time')]))).toEqual([
      'trigger_in_nodes',
    ]);
  });

  it('keeps structured outputs and pins on their kinds', () => {
    const outputs = [{ name: 'level', values: { a: { lit: 1 } } }];
    expect(codes(automation([begin(), finish(), node('log', 'debug.log', { outputs })]))).toEqual([
      'outputs_on_wrong_kind',
    ]);
    const pinned = node('log', 'debug.log', { pin: { revision: 1 } });
    expect(codes(automation([begin(), finish(), pinned]))).toEqual(['pin_on_wrong_kind']);
    const call = node('call', 'fn.call', { pin: { revision: 1 } });
    expect(codes(automation([begin(), finish(), call]))).toEqual([]);
  });

  it('keeps the mode, persist and input rules of version 3', () => {
    expect(codes(automation([begin(), finish()], { policy: { mode: 'single', max: 2 } }))).toEqual([
      'program_rule',
    ]);
    const persisting = {
      ...custom([begin(), finish()]),
      flavour: 'pure' as const,
      variables: [
        { name: 'kept', type: { t: 'number' } as const, initial: { lit: 0 }, persist: true },
      ],
    };
    expect(codes(persisting)).toEqual(['program_rule']);
    const requiredInput = { name: 'level', type: { t: 'number' } as const, required: true };
    const trigger = { id: id(2), key: 'tick', kind: 'trigger.time', ports: {} };
    expect(
      codes(automation([begin(), finish()], { inputs: [requiredInput], triggers: [trigger] })),
    ).toEqual(['program_rule']);
  });

  it('runs inside the schemas and reports the rule code', () => {
    const base = {
      version: 4,
      kind: 'automation',
      triggers: [],
      inputs: [],
      outputs: [],
      variables: [],
      policy: { mode: 'single' },
      nodes: [finish()],
    };
    const parsed = AUTOMATION_V4.safeParse(base);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain('Start');
    const fn = {
      version: 4,
      kind: 'function',
      flavour: 'action',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      nodes: [begin(), finish(), node('cool', 'timing.cooldown')],
    };
    expect(FUNCTION_V4.safeParse(fn).success).toBe(false);
  });
});
