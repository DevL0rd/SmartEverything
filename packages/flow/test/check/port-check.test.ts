import { describe, expect, it } from 'vitest';
import type { FlowNode, Scope } from '@smarteverything/domain';
import { check } from '../../src/check/check';
import type { CheckContext, Problem } from '../../src/check/check';
import {
  automation,
  context,
  wired,
  functionProgram,
  lit,
  node,
  scope,
  trigger,
  uuid,
} from './c23-support';
import type { Program } from '../../src/program/walk';

function run(body: readonly FlowNode[], ctx: CheckContext = context()): readonly Problem[] {
  return check(automation(body), ctx);
}

function only(problems: readonly Problem[]): Problem {
  const [first] = problems;
  if (first === undefined || problems.length !== 1) {
    throw new Error(`expected exactly one problem, got ${JSON.stringify(problems)}`);
  }
  return first;
}

const need = { need: lit('x') };

function probe(ports: Record<string, ReturnType<typeof lit>>): FlowNode {
  return node('p', 'probe.take', { ...need, ...ports });
}

describe('kinds and ports', () => {
  it('rejects a kind the registry does not have', () => {
    const problems = check(
      automation([node('a', 'no.such')], { triggers: [trigger('t', 'trigger.nope')] }),
      context(),
    );
    expect(problems.map((found) => [found.key, found.code, found.received])).toEqual([
      ['t', 'unknown_kind', 'trigger.nope'],
      ['a', 'unknown_kind', 'no.such'],
    ]);
    expect(problems[0]?.nodeId).toBeDefined();
    expect(problems[0]?.fix).toBeDefined();
  });

  it('keeps triggers and steps apart', () => {
    const problems = check(
      automation([node('a', 'trigger.time', { at: lit('07:00') })], {
        triggers: [trigger('t', 'notify.feed', { message: lit('x') })],
      }),
      context(),
    );
    expect(problems.map((found) => [found.key, found.code, found.fix])).toEqual([
      ['t', 'wrong_node_class', 'use a trigger kind'],
      ['a', 'wrong_node_class', 'use a step kind'],
    ]);
  });

  it('names the ports a kind has when one is unknown', () => {
    expect(
      only(run([node('a', 'notify.feed', { message: lit('x'), extra: lit(1) })])),
    ).toMatchObject({ code: 'unknown_port', port: 'extra', received: 'extra' });
    expect(
      only(run([node('a', 'notify.feed', { message: lit('x'), extra: lit(1) })])).fix,
    ).toContain('message');
  });

  it('says to remove a port when the kind has none', () => {
    const branches = [{ id: uuid(), when: lit(true), scope: scope() }];
    expect(only(run([node('a', 'flow.if', { extra: lit(1) }, { branches })]))).toMatchObject({
      code: 'unknown_port',
      fix: 'remove it',
    });
  });

  it('asks for the required ports that are missing', () => {
    expect(only(run([node('a', 'notify.feed')]))).toMatchObject({
      key: 'a',
      port: 'message',
      code: 'missing_port',
      expected: 'Text',
      fix: 'fill in message',
    });
  });
});

describe('steps without ports', () => {
  it('treats a missing port table as empty', () => {
    const bare: FlowNode = { id: uuid(), key: 'a', kind: 'notify.feed' };
    expect(only(run([bare])).code).toBe('missing_port');
  });
});

describe('static ports and literals', () => {
  it('wants a fixed value on a static port', () => {
    expect(only(run([probe({ fixed: wired('trigger.key') })]))).toMatchObject({
      code: 'static_not_literal',
      port: 'fixed',
    });
    expect(run([probe({ fixed: lit('x') })])).toEqual([]);
  });

  it('checks that a literal fits the port', () => {
    expect(only(run([probe({ count: lit(12) })]))).toMatchObject({
      code: 'invalid_literal',
      port: 'count',
      expected: 'Whole number from 0 to 9',
      received: '12',
    });
    expect(only(run([probe({ pick: lit('z') })])).code).toBe('invalid_literal');
    expect(only(run([probe({ at: lit('7am') })])).code).toBe('invalid_literal');
    expect(run([probe({ count: lit(3), pick: lit('a'), at: lit('07:00'), wait: lit(5) })])).toEqual(
      [],
    );
  });

  it('checks that references exist', () => {
    const known = new Set(['r1', 'd1']);
    expect(
      run([probe({ room: lit('r1'), target: lit({ device: 'd1' }) })], context({ known })),
    ).toEqual([]);
    const missing = run(
      [probe({ room: lit('r9'), target: lit({ devices: ['d1', 'd9'] }) })],
      context({ known }),
    );
    expect(missing.map((found) => [found.port, found.code, found.received])).toEqual([
      ['room', 'unknown_target', 'r9'],
      ['target', 'unknown_target', 'd9'],
    ]);
  });

  it('checks that a secret is stored', () => {
    const request = (id: string): FlowNode =>
      node('call', 'http.request', {
        url: lit('https://example.com'),
        auth: lit({ secret: id, scheme: 'bearer' }),
      });
    expect(run([request('s1')], context({ secrets: ['s1'] }))).toEqual([]);
    expect(only(run([request('s2')], context({ secrets: ['s1'] })))).toMatchObject({
      code: 'unknown_secret',
      port: 'auth',
      received: 's2',
    });
  });

  it('checks that a reusable node exists, and its revision', () => {
    const ctx = context({
      functions: { f1: { inputs: [], outputs: [], exits: ['done'] } },
      revisions: { f1: [1, 2] },
    });
    const call = (ports: Record<string, ReturnType<typeof lit>>): FlowNode =>
      node('call', 'fn.call', ports);
    expect(run([call({ fn: lit('f1') })], ctx)).toEqual([]);
    expect(run([call({ fn: lit('f1'), pin: lit(2) })], ctx)).toEqual([]);
    expect(only(run([call({ fn: lit('gone') })], ctx))).toMatchObject({
      code: 'unknown_function',
      port: 'fn',
    });
    expect(only(run([call({ fn: lit('f1'), pin: lit(7) })], ctx))).toMatchObject({
      code: 'unknown_function',
      port: 'pin',
      received: '7',
    });
    expect(only(run([call({ pin: lit(1) })], ctx)).code).toBe('missing_port');
  });
});

describe('wires', () => {
  it('reports a wire from a step or an output that does not exist', () => {
    expect(run([probe({ label: wired('nobody.home') })]).map((found) => found.code)).toEqual([
      'unknown_reference',
    ]);
    const length = node('len', 'list.length', { list: lit([1]) });
    expect(only(run([length, probe({ label: wired('len.size') })]))).toMatchObject({
      code: 'unknown_reference',
      port: 'label',
      received: 'len.size',
    });
    expect(only(run([probe({ label: wired('vars.none') })]))).toMatchObject({
      code: 'unknown_reference',
    });
  });
});

describe('types of values', () => {
  it('reports a value of the wrong type and offers the conversion', () => {
    expect(only(run([probe({ count: wired('trigger.key') })], context()))).toMatchObject({
      code: 'type_mismatch',
      port: 'count',
      expected: 'Whole number from 0 to 9',
      received: 'Text',
      fix: 'Wire it through a Convert node set to Number',
    });
    const yes = node('yes', 'logic.not', { flag: lit(false) });
    const mismatch = only(run([yes, probe({ count: wired('yes.result') })]));
    expect(mismatch.code).toBe('type_mismatch');
    expect(mismatch.fix).toBeUndefined();
  });

  it('follows a wire by the exact type of the output it reads', () => {
    const length = node('len', 'list.length', { list: lit([1, 2]) });
    expect(run([length, probe({ count: wired('len.length') })])).toEqual([]);
    expect(run([length, probe({ wait: wired('len.length') })])[0]?.code).toBe('type_mismatch');
  });

  it('takes a wired list of devices into a target and refuses other values there', () => {
    const found = node('found', 'device.query', {});
    const length = node('len', 'list.length', { list: lit([1, 2]) });
    const wired = { wire: { from: 'found', port: 'devices' } };
    const set = node('set', 'device.set', { target: wired, control: lit('power'), to: lit(true) });
    expect(run([found, set])).toEqual([]);
    const counted = { wire: { from: 'len', port: 'length' } };
    expect(run([length, probe({ target: counted })])[0]).toMatchObject({
      code: 'type_mismatch',
      port: 'target',
      expected: 'Target',
    });
  });

  it('leaves generic ports to the type resolution', () => {
    const compare = node('same', 'logic.compare', { a: lit(1), b: lit('x') });
    expect(run([compare]).map((found) => found.code)).toEqual(['generic_mismatch']);
  });

  it('says nothing more about a value that reads a step of an unknown kind', () => {
    const problems = run([node('ghost', 'no.such'), probe({ label: wired('ghost.value') })]);
    expect(problems.map((found) => found.code)).toEqual(['unknown_kind']);
  });
});

describe('kind rules', () => {
  const request = (ports: Record<string, ReturnType<typeof lit>>): FlowNode =>
    node('call', 'http.request', { url: lit('https://example.com'), ...ports });

  it('refuses headers that carry credentials', () => {
    const problems = run([
      request({ headers: lit({ Authorization: 'x', ' Cookie ': 'y', 'X-Trace': 'z' }) }),
    ]);
    expect(problems.map((found) => [found.code, found.received])).toEqual([
      ['forbidden_header', 'Authorization'],
      ['forbidden_header', ' Cookie '],
    ]);
    expect(problems[0]?.fix).toBe('use the auth port with a stored secret');
  });

  it('only looks at headers it can read', () => {
    expect(run([request({})])).toEqual([]);
    const found = node('rec', 'text.regex', { text: lit('a'), pattern: lit('a') });
    expect(run([found, request({ headers: wired('rec.groups') })])).toEqual([]);
    expect(run([request({ headers: lit(5) })]).map((found) => found.code)).toEqual([
      'invalid_literal',
    ]);
    expect(run([request({ headers: lit(null) })]).map((found) => found.code)).toEqual([
      'invalid_literal',
    ]);
  });
});

describe('reusable nodes and returns', () => {
  const ctx = context({
    functions: {
      f1: {
        inputs: [
          { name: 'room', type: { t: 'ref', of: 'room' }, required: true },
          { name: 'level', type: { t: 'number' }, required: true, default: 5 },
        ],
        outputs: [{ name: 'done', type: { t: 'boolean' } }],
        exits: ['d'],
      },
    },
    known: new Set(['r1']),
  });

  it('takes the inputs of the function as ports', () => {
    const call = (ports: Record<string, ReturnType<typeof lit>>): FlowNode =>
      node('call', 'fn.call', { fn: lit('f1'), ...ports });
    expect(run([call({ room: lit('r1') })], ctx)).toEqual([]);
    expect(only(run([call({})], ctx))).toMatchObject({ code: 'missing_port', port: 'room' });
    expect(only(run([call({ room: lit('r1'), level: wired('trigger.key') })], ctx))).toMatchObject({
      code: 'type_mismatch',
      port: 'level',
    });
    expect(run([call({ room: lit('r1') }), probe({ flag: wired('call.done') })], ctx)).toEqual([]);
  });

  it('accepts any port on a call whose function is not known', () => {
    const open = node('call', 'fn.call', { fn: lit('gone'), whatever: lit(1) });
    expect(run([open], ctx).map((found) => found.code)).toEqual(['unknown_function']);
  });

  it('takes the input names of the started automation as ports, its start checks the values', () => {
    const callee = {
      inputs: [
        { name: 'level', type: { t: 'number' as const }, required: true, default: 0 },
        { name: 'delay', type: { t: 'number' as const, min: 0, unit: 'ms' }, required: true },
      ],
      outputs: [{ name: 'done', type: { t: 'boolean' as const } }],
    };
    const runCtx = context({ known: new Set(['a1']), automations: { a1: callee } });
    const start = (ports: Record<string, ReturnType<typeof lit>>): FlowNode =>
      node('start', 'automation.run', { automation: lit('a1'), ...ports });
    expect(run([start({ level: lit(40), delay: lit(1500) })], runCtx)).toEqual([]);
    expect(only(run([start({ level: lit(40) })], runCtx))).toMatchObject({
      code: 'missing_port',
      port: 'delay',
    });
    expect(only(run([start({ delay: lit(1), ghost: lit(1) })], runCtx))).toMatchObject({
      code: 'unknown_port',
      port: 'ghost',
    });
    expect(run([start({ delay: wired('trigger.at') })], runCtx)).toEqual([]);
    expect(run([start({ delay: wired('trigger.key') })], runCtx)).toEqual([]);
    const waited = start({ delay: lit(1), wait: lit(true) });
    expect(run([waited, probe({ flag: wired('start.done') })], runCtx)).toEqual([]);
  });

  it('wants one value per output of the program on a return', () => {
    const items = node('items', 'list.make', { items: lit([1]) });
    const program = automation([items, node('end', 'flow.return', { a: wired('items.list') })], {
      outputs: [
        { name: 'a', type: { t: 'text' } },
        { name: 'b', type: { t: 'number' } },
        { name: 'c', type: { t: 'number' }, optional: true },
      ],
    });
    const found = check(program, context());
    expect(found.map((problem) => [problem.port, problem.code])).toEqual([
      ['b', 'missing_port'],
      ['a', 'type_mismatch'],
    ]);
  });

  it('types the inputs a called automation hands to its steps', () => {
    const program = automation([probe({ label: wired('start.room') })], {
      triggers: [trigger('start', 'trigger.called')],
      inputs: [{ name: 'room', type: { t: 'text' }, required: true }],
    });
    expect(check(program, context())).toEqual([]);
  });
});

describe('conditions', () => {
  it('wants a boolean in a branch and a case', () => {
    const id = uuid();
    const caseId = uuid();
    const program = automation(
      [
        node('len', 'list.length', { list: lit([1]) }),
        node('a', 'flow.if', {}, { branches: [{ id, when: wired('len.length'), scope: scope() }] }),
        node(
          'b',
          'flow.switch',
          { subject: lit(1) },
          {
            cases: [
              { id: caseId, match: { when: wired('trigger.key') }, scope: scope() },
              { id: uuid(), match: { eq: 1 }, scope: scope() },
            ],
          },
        ),
      ],
      { triggers: [trigger('t', 'trigger.time', { at: lit('07:00') })] },
    );
    expect(check(program, context()).map((found) => [found.key, found.port, found.code])).toEqual([
      ['a', `branch:${id}`, 'type_mismatch'],
      ['b', `case:${caseId}`, 'type_mismatch'],
    ]);
  });

  it('checks the admission and the start value of a variable', () => {
    const program = automation([node('len', 'list.length', { list: lit([1]) })], {
      admit: wired('len.length'),
      variables: [
        { name: 'one', type: { t: 'number' }, initial: lit('x') },
        { name: 'two', type: { t: 'number' }, initial: wired('trigger.key') },
        { name: 'ok', type: { t: 'number' }, initial: lit(1) },
      ],
    });
    const found = check(program, context());
    expect(found.map((problem) => [problem.key, problem.port, problem.code])).toEqual([
      [undefined, 'admit', 'type_mismatch'],
      [undefined, 'variables.one', 'invalid_literal'],
      [undefined, 'variables.two', 'type_mismatch'],
    ]);
    const unset = automation([], { admit: undefined });
    expect(check(unset, context())).toEqual([]);
    expect(check(functionProgram([]), context())).toEqual([]);
  });
});

describe('scopes', () => {
  it('checks the steps inside containers too', () => {
    const inner: Scope = scope(node('deep', 'notify.feed'));
    const program: Program = automation([
      node('each', 'flow.for_each', { items: lit(['a']) }, { scopes: { body: inner } }),
    ]);
    expect(check(program, context()).map((found) => [found.key, found.code])).toEqual([
      ['deep', 'missing_port'],
    ]);
  });
});
