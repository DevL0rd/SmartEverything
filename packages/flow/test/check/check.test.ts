import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { PROBLEM, PROBLEM_CODES, check } from '../../src/check/check';
import { problem, siteName, visibilityFix } from '../../src/check/problems';
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

const known = new Set(['r1', 'd1']);

function realistic(): ReturnType<typeof automation> {
  const branch = uuid();
  return automation(
    [
      node('len', 'list.length', { list: lit(['a', 'b']) }),
      node('big', 'logic.compare', { a: wired('len.length'), b: lit(1), op: lit('gt') }),
      node(
        'when',
        'flow.if',
        {},
        {
          branches: [{ id: branch, when: wired('big.result'), scope: scope(realisticSet()) }],
          scopes: { else: scope(node('quiet', 'notify.feed', { message: lit('nothing') })) },
          outputs: [{ name: 'level', values: { [branch]: wired('len.length'), else: lit(0) } }],
        },
      ),
      node('line', 'text.format', { template: lit('level {a}'), a: wired('when.level') }),
      node('note', 'notify.feed', { message: wired('line.text') }),
    ],
    {
      triggers: [trigger('t', 'trigger.time', { at: lit('07:00') })],
      admit: wired('big.result'),
      variables: [{ name: 'count', type: { t: 'number' }, initial: lit(0) }],
    },
  );
}

function realisticSet(): FlowNode {
  return node('lamp', 'device.set', {
    target: lit({ device: 'd1' }),
    control: lit('power'),
    to: lit(true),
  });
}

describe('check', () => {
  it('finds nothing wrong with a sound program', () => {
    expect(check(realistic(), context({ known }))).toEqual([]);
  });

  it('finds nothing wrong with a sound function', () => {
    const program = functionProgram([node('a', 'notify.feed', { message: wired('inputs.who') })], {
      inputs: [{ name: 'who', type: { t: 'text' }, required: true }],
    });
    expect(check(program, context())).toEqual([]);
  });

  it('reports a source that a function does not have and an output that does not exist', () => {
    const program = functionProgram([
      node('a', 'notify.feed', { message: wired('trigger.key') }),
      node('len', 'list.length', { list: lit([1]) }),
      node('b', 'notify.feed', { message: wired('len.nothing') }),
    ]);
    expect(check(program, context()).map((found) => [found.key, found.code])).toEqual([
      ['a', 'unknown_reference'],
      ['b', 'unknown_reference'],
    ]);
  });

  it('returns every problem at once, each one valid against the schema', () => {
    const program = automation(
      [
        node('a', 'notify.feed'),
        node('b', 'no.such'),
        node('c', 'probe.take', { need: wired('later.value'), count: lit(99), bogus: lit(1) }),
        node('later', 'notify.feed', { message: lit('x') }),
        node('d', 'notify.feed', { message: wired('vars.none') }),
      ],
      { admit: wired('nobody.home'), triggers: [trigger('t', 'trigger.time')] },
    );
    const problems = check(program, context());
    expect(problems.map((found) => found.code).sort()).toEqual(
      [
        'unknown_reference',
        'unknown_reference',
        'invalid_literal',
        'invisible_reference',
        'missing_port',
        'missing_port',
        'unknown_kind',
        'unknown_port',
        'unknown_reference',
      ].sort(),
    );
    for (const found of problems) expect(PROBLEM.safeParse(found).success).toBe(true);
  });

  it('turns visibility failures into problems with a fix', () => {
    const program = automation([
      node('a', 'notify.feed', { message: wired('b.out') }),
      node('b', 'probe.take', { need: lit('x') }),
    ]);
    expect(check(program, context())).toContainEqual(
      expect.objectContaining({
        key: 'a',
        port: 'message',
        code: 'invisible_reference',
        received: 'b.out',
        fix: 'move the step that gives the value above this one',
      }),
    );
  });

  it('reads the outputs of finished containers through the kind table', () => {
    const body = (): ReturnType<typeof scope> => scope();
    const program = automation([
      node('each', 'flow.for_each', { items: lit(['a']) }, { scopes: { body: body() } }),
      node('ghost', 'no.such', {}, { scopes: { body: body() } }),
      node('a', 'device.set', { target: lit({ device: 'd1' }), to: wired('each.results') }),
      node('b', 'probe.take', { need: wired('ghost.value') }),
    ]);
    const found = check(program, context({ known }));
    expect(
      found
        .filter((problem) => problem.code !== 'type_mismatch')
        .map((problem) => [problem.key, problem.code]),
    ).toEqual([
      ['b', 'invisible_reference'],
      ['ghost', 'unknown_kind'],
    ]);
  });

  it('names where in the program a bad reference sits', () => {
    const branch = uuid();
    const caseId = uuid();
    const program = automation(
      [
        node(
          'a',
          'flow.if',
          {},
          {
            branches: [{ id: branch, when: wired('ghost.x'), scope: scope() }],
            outputs: [{ name: 'out', values: { [branch]: wired('ghost.y') } }],
          },
        ),
        node(
          'b',
          'flow.switch',
          { subject: lit(1) },
          { cases: [{ id: caseId, match: { when: wired('ghost.z') }, scope: scope() }] },
        ),
      ],
      {
        triggers: [trigger('t', 'trigger.time', { at: wired('ghost.f') })],
        admit: wired('ghost.a'),
        variables: [{ name: 'v', type: { t: 'number' }, initial: wired('ghost.v') }],
      },
    );
    const ports = check(program, context())
      .filter((found) => found.code === 'unknown_reference')
      .map((found) => found.port)
      .sort();
    expect(ports).toEqual(
      [
        'admit',
        `branch:${branch}`,
        `case:${caseId}`,
        'at',
        `outputs.out.${branch}`,
        'variables.v',
      ].sort(),
    );
  });
});

describe('problems', () => {
  it('leaves out what is not given', () => {
    expect(problem({}, 'unknown_kind', 'x')).toEqual({ code: 'unknown_kind', message: 'x' });
    expect(
      problem({ nodeId: 'n', key: 'k' }, 'type_mismatch', 'x', {
        port: 'p',
        expected: 'e',
        received: 'r',
        fix: 'f',
      }),
    ).toEqual({
      nodeId: 'n',
      key: 'k',
      port: 'p',
      code: 'type_mismatch',
      message: 'x',
      expected: 'e',
      received: 'r',
      fix: 'f',
    });
  });

  it('validates the shape and the code', () => {
    expect(PROBLEM.safeParse({ code: 'unknown_kind', message: 'x' }).success).toBe(true);
    expect(PROBLEM.safeParse({ code: 'nonsense', message: 'x' }).success).toBe(false);
    expect(PROBLEM.safeParse({ code: 'unknown_kind', message: 'x', extra: 1 }).success).toBe(false);
    expect(PROBLEM_CODES.length).toBe(new Set(PROBLEM_CODES).size);
  });

  it('names every kind of site', () => {
    expect(siteName({ kind: 'port', port: 'a' })).toBe('a');
    expect(siteName({ kind: 'branch', id: 'i' })).toBe('branch:i');
    expect(siteName({ kind: 'case', id: 'i' })).toBe('case:i');
    expect(siteName({ kind: 'output', name: 'o', scope: 's' })).toBe('outputs.o.s');
    expect(siteName({ kind: 'admit' })).toBe('admit');
    expect(siteName({ kind: 'variable', name: 'v' })).toBe('variables.v');
  });

  it('has a fix for every visibility reason', () => {
    expect(visibilityFix('cycle')).toMatch(/pure/);
    expect(visibilityFix('self')).toBeDefined();
  });
});
