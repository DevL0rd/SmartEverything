import type { FlowNode, InputPortDecl, PortValue, Variable } from '@smarteverything/domain';
import { NODE_REGISTRY, REF_KINDS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { FactsContext } from '../../src/compile/facts';
import type { LoopFact } from '../../src/compile/facts';
import { factsOf } from '../../src/compile/facts';
import { lower } from '../../src/compile/lower';
import type { CalleeRef, ManifestKind, ManifestKinds } from '../../src/compile/manifest';
import {
  MANIFEST,
  MANIFEST_SLOTS,
  REF_SLOTS,
  callsIn,
  closureOf,
  manifestOf,
  walkOps,
} from '../../src/compile/manifest';
import type { Plan, PlanOp } from '../../src/compile/plan';
import { dependencyKeys, readIndex, readSites } from '../../src/compile/reads';
import { automation, context, wired, fn, lit, make, scope } from './support';

const kinds: ManifestKinds = (id) => NODE_REGISTRY.get(id);

const none = (): undefined => undefined;

function planFrom(
  nodes: FlowNode[],
  options: { variables?: Variable[]; failure?: FlowNode[] } = {},
): Plan {
  const base = automation(
    nodes,
    options.failure === undefined ? undefined : scope(...options.failure),
  );
  const result = lower({ ...base, variables: options.variables ?? [] }, context);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.plan;
}

function functionPlan(nodes: FlowNode[]): Plan {
  const result = lower(fn(nodes), context);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.plan;
}

function plansOf(entries: Record<string, Plan>): FactsContext['plans'] {
  return (callee) => entries[callee.fn];
}

const lamp = (key: string, extra: Record<string, PortValue> = {}): FlowNode =>
  make(key, 'device.set', { target: lit({ device: 'lamp' }), to: lit(true), ...extra });

function usesOf(plan: Plan, resolve: FactsContext['plans'] = none): ReturnType<typeof manifestOf> {
  return manifestOf(plan, kinds, resolve);
}

describe('slots', () => {
  it('cover every reference kind except the target, which is split', () => {
    expect([...REF_SLOTS].sort()).toEqual(REF_KINDS.filter((kind) => kind !== 'target').sort());
    expect(MANIFEST_SLOTS).toEqual([...REF_SLOTS, 'control', 'tool', 'host']);
  });
});

describe('manifest of devices', () => {
  it('lists the devices, rooms, groups and control of a target', () => {
    const plan = planFrom([
      make('a', 'device.set', {
        target: lit({
          device: 'd1',
          devices: ['d2', 'd3'],
          room: 'r1',
          group: 'g1',
          families: ['light'],
        }),
        control: lit('brightness'),
        to: lit(50),
      }),
    ]);
    const { uses, budgets, dynamic } = usesOf(plan);
    expect(uses.device).toEqual(['d1', 'd2', 'd3']);
    expect(uses.room).toEqual(['r1']);
    expect(uses.group).toEqual(['g1']);
    expect(uses.control).toEqual(['brightness']);
    expect(budgets).toEqual(['command']);
    expect(dynamic).toEqual([]);
  });

  it('counts the standard control of a port that was left out', () => {
    expect(usesOf(planFrom([lamp('a')])).uses.control).toEqual(['power']);
  });

  it('marks a target taken from a formula as dynamic', () => {
    const plan = planFrom([
      make('a', 'device.set', {
        target: wired('inputs.where'),
        control: wired('inputs.what'),
        to: lit(1),
      }),
    ]);
    const manifest = usesOf(plan);
    expect(manifest.dynamic).toEqual(['control', 'device', 'group', 'room']);
    expect(manifest.uses.device).toEqual([]);
  });

  it('ignores a target that is not a record and keys it does not know', () => {
    const plan = planFrom([
      make('a', 'device.set', { target: lit('lamp'), to: lit(1) }),
      make('b', 'device.set', { target: lit({ unknown: 'x' }), to: lit(1) }),
    ]);
    expect(usesOf(plan).uses.device).toEqual([]);
  });

  it('reads devices through a read node too', () => {
    const plan = planFrom([make('r', 'device.get', { device: lit('d9'), control: lit('level') })]);
    const manifest = usesOf(plan);
    expect(manifest.uses.device).toEqual(['d9']);
    expect(manifest.uses.control).toEqual(['level']);
    expect(manifest.budgets).toEqual([]);
  });

  it('descends into a temporary change and the failure handler', () => {
    const inner = make('in', 'device.set', { target: lit({ device: 'inner' }), to: lit(1) });
    const region = make(
      'region',
      'device.set_temporarily',
      { target: lit({ device: 'outer' }), to: lit(2) },
      { scopes: { body: scope(inner) } },
    );
    const failure = make('f', 'device.set', { target: lit({ device: 'alarm' }), to: lit(1) });
    const manifest = usesOf(planFrom([region], { failure: [failure] }));
    expect(manifest.uses.device).toEqual(['alarm', 'inner', 'outer']);
    expect(manifest.budgets).toEqual(['command']);
  });
});

describe('manifest of the outside world', () => {
  it('lists the host with its port, the secret and the owner flag of a web request', () => {
    const plan = planFrom([
      make('w', 'http.request', {
        url: lit('https://api.example.com:8443/v1/x?y=1'),
        auth: lit({ secret: 'secret-1', scheme: 'bearer' }),
      }),
    ]);
    const manifest = usesOf(plan);
    expect(manifest.uses.host).toEqual(['api.example.com:8443']);
    expect(manifest.uses.secret).toEqual(['secret-1']);
    expect(manifest.budgets).toEqual(['effects']);
    expect(manifest).toMatchObject({ owner: true, ai: false, dynamic: [] });
  });

  it('marks a host as dynamic when the address is built, partial or not text', () => {
    for (const url of [
      wired('inputs.url'),
      lit('not a url'),
      lit('mailto:a@b'),
      lit('file:///x'),
      lit('data:text/plain,hi'),
      lit(5),
    ]) {
      const manifest = usesOf(planFrom([make('w', 'http.request', { url })]));
      expect(manifest.dynamic).toEqual(['host']);
      expect(manifest.uses.host).toEqual([]);
    }
  });

  it('marks a wired secret as dynamic', () => {
    const plan = planFrom([
      make('w', 'http.request', { url: lit('https://a.example'), auth: wired('inputs.auth') }),
    ]);
    expect(usesOf(plan).dynamic).toEqual(['secret']);
  });

  it('lists the tool and marks the program owner only', () => {
    const plan = planFrom([
      make('t', 'tool.call', { tool: lit('list_devices'), person: lit('p1') }),
    ]);
    const manifest = usesOf(plan);
    expect(manifest.uses.tool).toEqual(['list_devices']);
    expect(manifest.uses.person).toEqual(['p1']);
    expect(manifest).toMatchObject({ owner: true, ai: false, budgets: ['effects'] });
  });

  it('marks the assistant', () => {
    const plan = planFrom([make('a', 'ai.wake', { instruction: lit('go'), chat: lit('c1') })]);
    const manifest = usesOf(plan);
    expect(manifest).toMatchObject({ ai: true, owner: true });
    expect(manifest.uses.chat).toEqual(['c1']);
  });

  it('lists a computer and leaves a member program unflagged', () => {
    const plan = planFrom([
      make('c', 'computer.audio', { computer: lit('pc1'), change: lit({ volume: 10 }) }),
    ]);
    const manifest = usesOf(plan);
    expect(manifest.uses.computer).toEqual(['pc1']);
    expect(manifest.owner).toBe(false);
    expect(manifest.ai).toBe(false);
  });

  it('marks a tool chosen by a formula as dynamic', () => {
    const plan = planFrom([make('t', 'tool.call', { tool: wired('inputs.tool') })]);
    expect(usesOf(plan).dynamic).toEqual(['tool']);
  });
});

describe('manifest of budgets and values', () => {
  it('counts a durable variable write but not a run variable write', () => {
    const run = make('a', 'var.set', { source: lit('run'), name: lit('x'), to: lit(1) });
    const automationWrite = make('b', 'var.change', {
      source: lit('automation'),
      name: lit('y'),
      op: lit('add'),
      amount: lit(1),
    });
    expect(usesOf(planFrom([run])).budgets).toEqual([]);
    expect(usesOf(planFrom([automationWrite])).budgets).toEqual(['effects']);
  });

  it('lists a home value that is written', () => {
    const write = make('a', 'var.set', { source: lit('home'), value: lit('value-1'), to: lit(1) });
    const manifest = usesOf(planFrom([write]));
    expect(manifest.uses.value).toEqual(['value-1']);
    expect(manifest.budgets).toEqual(['effects']);
  });

  it('lists a home value that is read', () => {
    const read = make('a', 'var.get', { source: lit('home'), value: lit('value-2') });
    expect(usesOf(planFrom([read])).uses.value).toEqual(['value-2']);
  });

  it('collects the person budget next to the shared one', () => {
    const plan = planFrom([
      make('n', 'notify.person', { people: lit(['p1']), title: lit('t'), body: lit('b') }),
      make('d', 'debug.log', { message: lit('m') }),
    ]);
    const manifest = usesOf(plan);
    expect(manifest.budgets).toEqual(expect.arrayContaining(['effects_person']));
    expect(manifest.uses.person).toEqual(['p1']);
  });

  it('draws the shared budget for an effect that is only durable by kind', () => {
    const plan: Plan = {
      version: 1,
      subject: 'automation',
      exits: [],
      variables: [],
      body: {
        op: 'seq',
        ops: [
          {
            op: 'effect',
            at: { id: 'e', key: 'e' },
            kind: 'debug.log',
            params: {},
            retry: 'idempotent',
            budget: 'effects_if_durable',
          },
          {
            op: 'effect',
            at: { id: 'f', key: 'f' },
            kind: 'debug.log',
            params: {},
            retry: 'idempotent',
            budget: 'none',
          },
        ],
      },
    };
    expect(usesOf(plan).budgets).toEqual(['effects']);
  });
});

describe('manifest through calls', () => {
  const callee = functionPlan([lamp('inside')]);
  const caller = planFrom([
    make('c', 'fn.call', { fn: lit('f1') }),
    make('r', 'automation.run', { automation: lit('a9') }),
  ]);

  it('joins the manifest of the called function', () => {
    const manifest = usesOf(caller, plansOf({ f1: callee }));
    expect(manifest.uses.device).toEqual(['lamp']);
    expect(manifest.uses.function).toEqual(['f1']);
    expect(manifest.uses.automation).toEqual(['a9']);
    expect(manifest.missing).toEqual([]);
  });

  it('inherits the owner flag of a called function', () => {
    const web = functionPlan([make('w', 'http.request', { url: lit('https://x.example') })]);
    const manifest = usesOf(caller, plansOf({ f1: web }));
    expect(manifest.owner).toBe(true);
    expect(manifest.uses.host).toEqual(['x.example']);
  });

  it('names a function that cannot be found', () => {
    const manifest = usesOf(caller, plansOf({}));
    expect(manifest.missing).toEqual(['f1']);
    expect(manifest.uses.device).toEqual([]);
  });

  it('follows a chain of calls and survives a call cycle', () => {
    const a = functionPlan([make('x', 'fn.call', { fn: lit('b') }), lamp('la')]);
    const b = functionPlan([
      make('y', 'fn.call', { fn: lit('a') }),
      make('z', 'device.set', { target: lit({ device: 'other' }), to: lit(1) }),
    ]);
    const root = planFrom([make('c', 'fn.call', { fn: lit('a') })]);
    const manifest = usesOf(root, plansOf({ a, b }));
    expect(manifest.uses.device).toEqual(['lamp', 'other']);
    expect(manifest.uses.function).toEqual(['a', 'b']);
  });

  it('resolves each pinned revision on its own', () => {
    const seen: CalleeRef[] = [];
    const root = planFrom([
      make('c1', 'fn.call', { fn: lit('f1'), pin: lit(1) }),
      make('c2', 'fn.call', { fn: lit('f1'), pin: lit(2) }),
      make('c3', 'fn.call', { fn: lit('f1'), pin: lit(2) }),
      make('c4', 'fn.call', { fn: lit('f1') }),
    ]);
    manifestOf(root, kinds, (call) => {
      seen.push(call);
      return callee;
    });
    expect(seen).toEqual([
      { fn: 'f1', pin: 1 },
      { fn: 'f1', pin: 2 },
      { fn: 'f1', pin: undefined },
    ]);
  });
});

describe('manifest of typed ports', () => {
  const port = (name: string, type: InputPortDecl['type']): InputPortDecl => ({
    name,
    type,
    required: false,
    description: name,
  });

  const nested: ManifestKind = {
    id: 'x.nested',
    access: 'member',
    inputs: [
      port('scenes', { t: 'list', of: { t: 'ref', of: 'scene' } }),
      port('pair', { t: 'record', fields: { phone: { t: 'ref', of: 'phone' } } }),
      port('byName', { t: 'record', values: { t: 'ref', of: 'camera' } }),
      port('maybe', { t: 'optional', of: { t: 'ref', of: 'chat' } }),
      port('count', { t: 'number' }),
      port('plain', { t: 'record' }),
    ],
  };

  const custom: ManifestKinds = (id) => (id === nested.id ? nested : kinds(id));

  function nestedPlan(ports: Record<string, PortValue>): Plan {
    const result = lower(automation([make('n', 'x.nested', ports)]), {
      kinds: (id) =>
        id === nested.id
          ? {
              ...nested,
              class: 'effect',
              exits: [],
              effect: { retry: 'idempotent', budget: 'none' },
            }
          : NODE_REGISTRY.get(id),
    });
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    return result.plan;
  }

  it('finds references inside lists, records, values and optionals', () => {
    const plan = nestedPlan({
      scenes: lit(['s1', 's2']),
      pair: lit({ phone: 'ph1', other: 'ignored' }),
      byName: lit({ a: 'cam1', b: 'cam2' }),
      maybe: lit('chat1'),
      count: lit(4),
      plain: lit({ x: 'y' }),
    });
    const manifest = manifestOf(plan, custom, none);
    expect(manifest.uses).toMatchObject({
      scene: ['s1', 's2'],
      phone: ['ph1'],
      camera: ['cam1', 'cam2'],
      chat: ['chat1'],
    });
    expect(manifest.dynamic).toEqual([]);
  });

  it('ignores literals that do not have the declared shape', () => {
    const plan = nestedPlan({ scenes: lit('s1'), pair: lit(['ph1']), byName: lit(3) });
    expect(manifestOf(plan, custom, none).uses.scene).toEqual([]);
  });

  it('marks every slot the type can hold as dynamic for a wire', () => {
    const plan = nestedPlan({
      scenes: wired('a.value'),
      pair: wired('b.value'),
      byName: wired('c.value'),
      maybe: wired('d.value'),
      count: wired('e.value'),
      plain: wired('f.value'),
    });
    expect(manifestOf(plan, custom, none).dynamic).toEqual(['camera', 'chat', 'phone', 'scene']);
  });

  it('refuses a plan whose node kind is unknown', () => {
    expect(() => manifestOf(planFrom([lamp('a')]), () => undefined, none)).toThrow(
      'no node kind is called "device.set"',
    );
  });

  it('produces a manifest that matches its stored schema, sorted', () => {
    const plan = planFrom([
      lamp('b', { target: lit({ device: 'zeta' }) }),
      lamp('a', { target: lit({ device: 'alpha' }) }),
      lamp('c', { target: lit({ device: 'zeta' }) }),
    ]);
    const manifest = usesOf(plan);
    expect(MANIFEST.safeParse(manifest).success).toBe(true);
    expect(manifest.uses.device).toEqual(['alpha', 'zeta']);
    expect(Object.keys(manifest.uses)).toEqual([...MANIFEST_SLOTS]);
  });
});

describe('plan walking', () => {
  it('lists every operation of every structure once', () => {
    const body = make(
      'p',
      'flow.parallel',
      {},
      { scopes: { a: scope(make('s1', 'flow.stop')), b: scope(make('s2', 'flow.stop')) } },
    );
    const tried = make(
      't',
      'flow.try',
      {},
      {
        scopes: { try: scope(make('s3', 'flow.stop')), finally: scope(make('s4', 'flow.stop')) },
        catches: [{ id: 'c1', scope: scope(make('s5', 'flow.stop')) }],
      },
    );
    const branch = make(
      'i',
      'flow.if',
      {},
      {
        branches: [{ id: 'b1', when: lit(true), scope: scope(make('s6', 'flow.stop')) }],
        scopes: { else: scope(make('s7', 'flow.stop')) },
      },
    );
    const choice = make(
      'sw',
      'flow.switch',
      { subject: lit(1) },
      {
        cases: [{ id: 'k1', match: { eq: 1 }, scope: scope(make('s8', 'flow.stop')) }],
        scopes: { default: scope(make('s9', 'flow.stop')) },
      },
    );
    const plan = planFrom([body, tried, branch, choice]);
    const stops = plan.body.op === 'seq' ? walkOps(plan.body).filter((op) => op.op === 'stop') : [];
    expect(stops.map((op) => op.at.key).sort()).toEqual([
      's1',
      's2',
      's3',
      's4',
      's5',
      's6',
      's7',
      's8',
      's9',
    ]);
  });

  it('lists the operations of structures that leave their optional parts out', () => {
    const plan = planFrom([
      make('i', 'flow.if', {}, { branches: [{ id: 'b1', when: lit(true), scope: scope() }] }),
      make('sw', 'flow.switch', { subject: lit(1) }, { cases: [] }),
      make('t', 'flow.try', {}, { scopes: { try: scope() } }),
    ]);
    expect(walkOps(plan.body).map((op) => op.op)).toEqual([
      'seq',
      'branch',
      'seq',
      'switch',
      'try',
      'seq',
    ]);
  });

  it('finds the calls once per function and revision', () => {
    const plan = planFrom([
      make('a', 'fn.call', { fn: lit('f1') }),
      make('b', 'fn.call', { fn: lit('f1') }),
      make('c', 'fn.call', { fn: lit('f2'), pin: lit(3) }),
    ]);
    expect(callsIn(plan)).toEqual([
      { fn: 'f1', pin: undefined },
      { fn: 'f2', pin: 3 },
    ]);
  });

  it('collects the plans a program reaches and the functions it cannot find', () => {
    const inner = functionPlan([make('x', 'fn.call', { fn: lit('gone') })]);
    const root = planFrom([make('c', 'fn.call', { fn: lit('f1') })]);
    const closure = closureOf(root, plansOf({ f1: inner }));
    expect(closure.plans).toEqual([root, inner]);
    expect(closure.missing).toEqual(['gone']);
  });
});

describe('dependency keys', () => {
  const temperature = make('temp', 'device.get', {
    device: lit('d1'),
    control: lit('temperature'),
  });

  function keysOfWait(
    value: PortValue,
    extra: FlowNode[] = [],
    variables: Variable[] = [],
  ): readonly string[] {
    const wait = make('w', 'flow.wait_condition', { condition: value });
    const plan = planFrom([temperature, ...extra, wait], { variables });
    const site = readSites(plan, kinds).find((entry) => entry.at.key === 'w');
    return site?.keys ?? [];
  }

  const compare = (key: string, a: PortValue, b: PortValue): FlowNode =>
    make(key, 'logic.compare', { a, op: lit('gt'), b });

  it('names the keys of the read node a condition uses', () => {
    const hot = compare('hot', wired('temp.value'), lit(20));
    expect(keysOfWait(wired('hot.result'), [hot])).toEqual(['device:temperature']);
  });

  it('keeps device reads whole when the control is not fixed', () => {
    const open = make('open', 'device.get', { device: lit('d1'), control: wired('inputs.c') });
    const plan = planFrom([
      open,
      make('w', 'flow.wait_condition', { condition: wired('open.value') }),
    ]);
    expect(readSites(plan, kinds)[0]?.keys).toEqual(['device']);
  });

  it('names variables by how long they live', () => {
    const variables: Variable[] = [
      { name: 'kept', type: { t: 'number' }, initial: lit(0), persist: true },
      { name: 'temporary', type: { t: 'number' }, initial: lit(0) },
    ];
    const both = compare('both', wired('vars.kept'), wired('vars.temporary'));
    expect(keysOfWait(wired('both.result'), [both], variables)).toEqual([
      'persistent:kept',
      'run:temporary',
    ]);
    expect(keysOfWait(wired('vars.undeclared'))).toEqual(['run:undeclared']);
  });

  it('names the home zone and nothing for fixed sources', () => {
    expect(keysOfWait(wired('home.timeZone'))).toEqual(['home:zone']);
    expect(keysOfWait(wired('home.name'))).toEqual([]);
    expect(keysOfWait(wired('trigger.at'))).toEqual([]);
    expect(keysOfWait(wired('inputs.a'))).toEqual([]);
    expect(keysOfWait(wired('run.id'))).toEqual([]);
  });

  it('follows read and pure nodes through their own inputs once', () => {
    const doubled = make('doubled', 'math.multiply', { a: wired('temp.value'), b: lit(2) });
    const clock = make('clock', 'date.now');
    const mixed = make('mixed', 'math.add', {
      a: wired('doubled.result'),
      b: wired('doubled.result'),
      c: wired('clock.at'),
    });
    const big = compare('big', wired('mixed.result'), lit(3));
    const keys = keysOfWait(wired('big.result'), [doubled, clock, mixed, big]);
    expect(keys).toEqual(['clock:now', 'device:temperature']);
  });

  it('ignores nodes that only act', () => {
    const acts = lamp('lamp');
    expect(keysOfWait(wired('lamp.ok'), [acts])).toEqual([]);
  });

  it('gives nothing for a fixed value and the same keys through a plain index', () => {
    const plan = planFrom([temperature]);
    expect(dependencyKeys(readIndex(plan), lit(true))).toEqual([]);
    expect(dependencyKeys(readIndex(plan), wired('temp.value'))).toEqual(['device:temperature']);
  });
});

describe('live port sites', () => {
  it('lists live ports of effects, waits and loops with their keys', () => {
    const level = make('level', 'var.get', { source: lit('run'), name: lit('level') });
    const setter = lamp('set', { to: wired('level.value') });
    const wait = make('wait', 'flow.wait_condition', { condition: lit(true) });
    const above = make('above', 'logic.compare', {
      a: wired('level.value'),
      op: lit('gt'),
      b: lit(1),
    });
    const loop = make(
      'lp',
      'flow.while',
      { condition: wired('above.result') },
      { scopes: { body: scope(make('b', 'flow.break')) } },
    );
    const each = make(
      'each',
      'flow.for_each',
      { items: lit([1]), collect: wired('level.value') },
      { scopes: { body: scope() } },
    );
    const plain = make(
      'again',
      'flow.for_each',
      { items: lit([1]) },
      { scopes: { body: scope() } },
    );
    const sites = readSites(planFrom([level, above, setter, wait, loop, each, plain]), kinds);
    expect(sites.map((site) => [site.at.key, site.port, [...site.keys]])).toEqual([
      ['set', 'to', ['run:level']],
      ['wait', 'condition', []],
      ['lp', 'condition', ['run:level']],
      ['each', 'collect', ['run:level']],
    ]);
  });

  it('skips a live port that was not given and ports that are not live', () => {
    const sites = readSites(planFrom([lamp('set', { control: lit('level') })]), kinds);
    expect(sites.map((site) => site.port)).toEqual(['to']);
    expect(
      readSites(planFrom([make('s', 'device.set', { target: lit({ device: 'a' }) })]), kinds),
    ).toEqual([]);
  });
});

describe('plan facts', () => {
  const context = (entries: Record<string, Plan> = {}): FactsContext => ({
    kinds,
    plans: plansOf(entries),
  });

  const wait = (key: string): FlowNode => make(key, 'flow.wait', { duration: lit(1000) });

  const loopOf = (
    kind: string,
    body: FlowNode[],
    ports: Record<string, PortValue> = {},
  ): FlowNode =>
    make('lp', kind, { times: lit(3), ...ports }, { scopes: { body: scope(...body) } });

  const loopFact = (nodes: FlowNode[], entries: Record<string, Plan> = {}): readonly LoopFact[] =>
    factsOf(planFrom(nodes), context(entries)).loops;

  it('says whether a loop body can suspend', () => {
    expect(loopFact([loopOf('flow.repeat', [make('s', 'flow.stop')])])).toMatchObject([
      { at: { key: 'lp' }, canSuspend: false, gap: false },
    ]);
    expect(loopFact([loopOf('flow.repeat', [wait('w')])])[0]).toMatchObject({ canSuspend: true });
    expect(loopFact([loopOf('flow.repeat', [lamp('l')])])[0]).toMatchObject({ canSuspend: true });
  });

  it('counts writes that leave the run and not those that stay in it', () => {
    const runWrite = make('a', 'var.set', { source: lit('run'), name: lit('x'), to: lit(1) });
    const homeWrite = make('b', 'var.set', { source: lit('home'), value: lit('v'), to: lit(1) });
    expect(loopFact([loopOf('flow.repeat', [runWrite])])[0]?.canSuspend).toBe(false);
    expect(loopFact([loopOf('flow.repeat', [homeWrite])])[0]?.canSuspend).toBe(true);
  });

  it('counts starting another automation and a gap of an inner loop', () => {
    const start = make('r', 'automation.run', { automation: lit('a2') });
    const inner = make(
      'in',
      'flow.repeat',
      { times: lit(2), gap: lit(500) },
      { scopes: { body: scope() } },
    );
    expect(loopFact([loopOf('flow.repeat', [start])])[0]?.canSuspend).toBe(true);
    const facts = loopFact([loopOf('flow.repeat', [inner])]);
    expect(facts.map((fact) => [fact.at.key, fact.canSuspend, fact.gap])).toEqual([
      ['lp', true, false],
      ['in', false, true],
    ]);
  });

  it('looks through calls to functions that can suspend', () => {
    const waits = functionPlan([wait('w')]);
    const quiet = functionPlan([make('m', 'math.add', { a: lit(1), b: lit(2) })]);
    const nesting = functionPlan([make('c', 'fn.call', { fn: lit('waits') })]);
    const body = [make('c', 'fn.call', { fn: lit('waits') })];
    expect(loopFact([loopOf('flow.repeat', body)], { waits })[0]?.canSuspend).toBe(true);
    expect(
      loopFact([loopOf('flow.repeat', [make('c', 'fn.call', { fn: lit('quiet') })])], { quiet })[0]
        ?.canSuspend,
    ).toBe(false);
    expect(
      loopFact([loopOf('flow.repeat', [make('c', 'fn.call', { fn: lit('nesting') })])], {
        nesting,
        waits,
      })[0]?.canSuspend,
    ).toBe(true);
    expect(
      loopFact([loopOf('flow.repeat', [make('c', 'fn.call', { fn: lit('missing') })])])[0]
        ?.canSuspend,
    ).toBe(false);
  });

  it('asks about the same call only once', () => {
    let asked = 0;
    const quiet = functionPlan([make('m', 'math.add', { a: lit(1), b: lit(2) })]);
    const twice = loopOf('flow.repeat', [
      make('c1', 'fn.call', { fn: lit('quiet') }),
      make('c2', 'fn.call', { fn: lit('quiet') }),
    ]);
    const facts = factsOf(planFrom([twice]), {
      kinds,
      plans: (call) => {
        if (call.fn === 'quiet') asked += 1;
        return quiet;
      },
    });
    expect(facts.loops[0]?.canSuspend).toBe(false);
    expect(asked).toBe(2);
  });

  it('records each wait with its durability and keys', () => {
    const level = make('level', 'var.get', { source: lit('run'), name: lit('level') });
    const above = make('above', 'logic.compare', {
      a: wired('level.value'),
      op: lit('gt'),
      b: lit(1),
    });
    const inside = make('inside', 'flow.wait_condition', { condition: wired('above.result') });
    const region = make(
      'region',
      'device.set_temporarily',
      { target: lit({ device: 'a' }), to: lit(1) },
      { scopes: { body: scope(inside, wait('short')) } },
    );
    const outside = make('outside', 'flow.wait_condition', { condition: wired('above.result') });
    const event = make('event', 'flow.wait_event', { source: lit('device'), kind: lit('changed') });
    const facts = factsOf(planFrom([level, above, region, outside, event]), context());
    expect(
      facts.waits.map((fact) => [fact.at.key, fact.kind, fact.durable, [...fact.keys]]),
    ).toEqual([
      ['inside', 'condition', false, ['run:level']],
      ['short', 'duration', false, []],
      ['outside', 'condition', true, ['run:level']],
      ['event', 'event', true, []],
    ]);
  });

  it('lists direct calls, started automations and the owner flag', () => {
    const facts = factsOf(
      planFrom([
        make('c', 'fn.call', { fn: lit('f1') }),
        make('r1', 'automation.run', { automation: lit('zz') }),
        make('r2', 'automation.run', { automation: lit('aa') }),
        make('r3', 'automation.run', { automation: lit('zz') }),
      ]),
      context({ f1: functionPlan([lamp('l')]) }),
    );
    expect(facts.calls).toEqual([{ fn: 'f1', pin: undefined }]);
    expect(facts.runs).toEqual(['aa', 'zz']);
    expect(facts.ownerOnly).toBe(false);
    expect(facts.manifest.uses.device).toEqual(['lamp']);
  });

  it('makes a program owner only when a called function reaches the owner kinds', () => {
    const facts = factsOf(
      planFrom([make('c', 'fn.call', { fn: lit('ask') })]),
      context({ ask: functionPlan([make('a', 'ai.wake', { instruction: lit('x') })]) }),
    );
    expect(facts.ownerOnly).toBe(true);
    expect(facts.manifest.ai).toBe(true);
  });

  it('reports the live port sites', () => {
    const clock = make('clock', 'date.now');
    const facts = factsOf(planFrom([clock, lamp('l', { to: wired('clock.at') })]), context());
    expect(facts.reads).toMatchObject([{ at: { key: 'l' }, port: 'to', keys: ['clock:now'] }]);
  });

  it('gives empty facts for an empty plan', () => {
    const facts = factsOf(planFrom([]), context());
    expect(facts).toMatchObject({
      calls: [],
      runs: [],
      loops: [],
      waits: [],
      reads: [],
      ownerOnly: false,
    });
    expect(MANIFEST.safeParse(facts.manifest).success).toBe(true);
  });
});

describe('operations as a list', () => {
  it('walks a hand built plan in order', () => {
    const ops: PlanOp[] = [{ op: 'breakpoint', at: { id: 'x', key: 'x' } }];
    expect(walkOps({ op: 'seq', ops })).toEqual([{ op: 'seq', ops }, ...ops]);
  });
});
