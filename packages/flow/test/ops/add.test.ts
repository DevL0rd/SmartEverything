import { describe, expect, it } from 'vitest';
import { applyPatch } from '../../src/ops/reducer';
import {
  automation,
  bodyKeys,
  branching,
  fn,
  loop,
  node,
  ok,
  refused,
  roundTrip,
  trigger,
  uuid,
  withTriggers,
} from './support';

const base = (): ReturnType<typeof automation> =>
  automation([node('a', 'notify.feed'), node('b', 'notify.feed')]);

describe('add', () => {
  it('appends by default and fills a key and an id', () => {
    const result = ok(base(), [{ op: 'add', node: { kind: 'notify.feed' }, in: 'body' }]);
    expect(bodyKeys(result.program)).toEqual(['a', 'b', 'notifyFeed']);
    const created = result.created[0];
    expect(created?.key).toBe('notifyFeed');
    expect(result.program.body.nodes[2]?.id).toBe(created?.id);
    expect(result.inverse).toEqual([{ op: 'remove', key: 'notifyFeed' }]);
  });

  it('places before, after and at an index, and undoes each', () => {
    const at = (place: Record<string, unknown>): string[] =>
      bodyKeys(
        roundTrip(base(), [
          { op: 'add', node: { kind: 'notify.feed', key: 'c' }, in: 'body', ...place },
        ]),
      );
    expect(at({ after: 'a' })).toEqual(['a', 'c', 'b']);
    expect(at({ before: 'a' })).toEqual(['c', 'a', 'b']);
    expect(at({ before: 'b' })).toEqual(['a', 'c', 'b']);
    expect(at({ index: 1 })).toEqual(['a', 'c', 'b']);
    expect(at({ index: 2 })).toEqual(['a', 'b', 'c']);
  });

  it('refuses a placement that does not exist', () => {
    const node1 = { kind: 'notify.feed' };
    expect(refused(base(), [{ op: 'add', node: node1, in: 'body', index: 3 }]).code).toBe(
      'bad_placement',
    );
    expect(refused(base(), [{ op: 'add', node: node1, in: 'body', after: 'zzz' }]).code).toBe(
      'bad_placement',
    );
  });

  it('keeps explicit ids and keys and refuses clashes', () => {
    const id = uuid();
    const done = ok(base(), [
      { op: 'add', node: { kind: 'notify.feed', key: 'c', id }, in: 'body' },
    ]);
    expect(done.program.body.nodes[2]?.id).toBe(id);
    expect(
      refused(base(), [{ op: 'add', node: { kind: 'notify.feed', key: 'a' }, in: 'body' }]).code,
    ).toBe('key_taken');
    expect(
      refused(base(), [{ op: 'add', node: { kind: 'notify.feed', key: 'vars' }, in: 'body' }]).code,
    ).toBe('key_taken');
    const program = base();
    const taken = program.body.nodes[0]?.id ?? '';
    expect(
      refused(program, [{ op: 'add', node: { kind: 'notify.feed', id: taken }, in: 'body' }]).code,
    ).toBe('id_taken');
  });

  it('generates distinct keys for repeated kinds and avoids used ids', () => {
    const result = ok(base(), [
      { op: 'add', node: { kind: 'notify.feed' }, in: 'body' },
      { op: 'add', node: { kind: 'notify.feed' }, in: 'body' },
    ]);
    expect(bodyKeys(result.program).slice(2)).toEqual(['notifyFeed', 'notifyFeed2']);
  });

  it('asks for another id while the new one is taken', () => {
    const program = base();
    const taken = program.body.nodes[0]?.id ?? '';
    const queue = [taken, taken, '22222222-2222-4222-8222-222222222222'];
    const result = applyPatch(program, [{ op: 'add', node: { kind: 'notify.feed' }, in: 'body' }], {
      newId: () => queue.shift() ?? '',
    });
    expect(result.ok && result.created[0]?.id).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('fills a whole tree: ids and keys for branches, scopes and children', () => {
    const result = ok(base(), [
      {
        op: 'add',
        in: 'body',
        node: {
          kind: 'flow.if',
          key: 'check',
          branches: [
            { when: { lit: true }, scope: { nodes: [{ kind: 'notify.feed', key: 'yes' }] } },
          ],
          scopes: { else: { nodes: [{ kind: 'notify.feed', key: 'no' }] } },
          label: 'Check',
        },
      },
    ]);
    const check = result.program.body.nodes[2];
    const branch = check?.branches?.[0];
    expect(branch?.id).toMatch(/^11111111/);
    expect(branch?.scope.nodes[0]?.key).toBe('yes');
    expect(check?.scopes?.['else']?.nodes[0]?.key).toBe('no');
  });

  it('fills switch cases and try catches', () => {
    const result = ok(base(), [
      {
        op: 'add',
        in: 'body',
        node: { kind: 'flow.switch', cases: [{ match: { eq: 1 }, scope: { nodes: [] } }] },
      },
      {
        op: 'add',
        in: 'body',
        node: {
          kind: 'flow.try',
          scopes: { try: { nodes: [] } },
          catches: [{ classes: ['Timeout'], scope: { nodes: [] } }, { scope: { nodes: [] } }],
        },
      },
    ]);
    expect(result.program.body.nodes[2]?.cases?.[0]?.id).toMatch(/^11111111/);
    const catches = result.program.body.nodes[3]?.catches;
    expect(catches?.[0]?.classes).toEqual(['Timeout']);
    expect(catches?.[1]).not.toHaveProperty('classes');
  });

  it('adds inside a scope of another node and undoes it', () => {
    const program = automation([loop('rep', [node('x', 'notify.feed')])]);
    const result = roundTrip(program, [
      { op: 'add', node: { kind: 'notify.feed', key: 'y' }, in: 'rep.body', before: 'x' },
    ]);
    const inner = result.body.nodes[0]?.scopes?.['body']?.nodes;
    expect(inner?.map((n) => n.key)).toEqual(['y', 'x']);
  });

  it('adds inside a branch of another node', () => {
    const cond = branching('cond', { lit: true }, []);
    const branchId = cond.branches?.[0]?.id ?? '';
    const added = ok(automation([cond]), [
      { op: 'add', node: { kind: 'notify.feed', key: 'z' }, in: `cond.branch:${branchId}` },
    ]);
    expect(added.program.body.nodes[0]?.branches?.[0]?.scope.nodes[0]?.key).toBe('z');
  });

  it('adds a trigger to the triggers and undoes it', () => {
    const program = withTriggers(base(), trigger('press'));
    const result = ok(program, [
      {
        op: 'add',
        in: 'triggers',
        node: {
          kind: 'trigger.signal',
          ports: { kind: { lit: 'button' } },
          label: 'Press',
        },
        before: 'press',
      },
    ]);
    if (result.program.kind !== 'automation') throw new Error('automation');
    expect(result.program.triggers.map((t) => t.key)).toEqual(['triggerSignal', 'press']);
    expect(result.program.triggers[0]?.label).toBe('Press');
    roundTrip(program, [{ op: 'add', in: 'triggers', node: { kind: 'trigger.signal' } }]);
  });

  it('refuses trigger and node mix-ups', () => {
    expect(
      refused(base(), [{ op: 'add', in: 'triggers', node: { kind: 'notify.feed' } }]).code,
    ).toBe('not_allowed');
    expect(
      refused(base(), [{ op: 'add', in: 'body', node: { kind: 'trigger.signal' } }]).code,
    ).toBe('not_allowed');
    expect(
      refused(base(), [
        {
          op: 'add',
          in: 'triggers',
          node: { kind: 'trigger.signal', policy: { onError: 'fail' } },
        },
      ]).code,
    ).toBe('not_allowed');
    expect(
      refused(fn([]), [{ op: 'add', in: 'triggers', node: { kind: 'trigger.signal' } }]).code,
    ).toBe('bad_target');
  });

  it('refuses a scope that does not exist or is not a path', () => {
    expect(
      refused(base(), [{ op: 'add', in: 'ghost.body', node: { kind: 'notify.feed' } }]).code,
    ).toBe('bad_target');
    expect(
      refused(base(), [{ op: 'add', in: 'not a path', node: { kind: 'notify.feed' } }]).code,
    ).toBe('bad_target');
  });

  it('refuses a key a wire already reads', () => {
    const program = automation([
      node('a', 'notify.feed', { v: { wire: { from: 'ghost', port: 'value' } } }),
    ]);
    const result = refused(program, [
      { op: 'add', in: 'body', node: { kind: 'notify.feed', key: 'ghost' } },
    ]);
    expect(result.code).toBe('referenced');
    expect(result.reason).toContain('"ghost" is read by port "v" of "a"');
    const nested = refused(program, [
      {
        op: 'add',
        in: 'body',
        node: {
          kind: 'flow.repeat',
          scopes: { body: { nodes: [{ kind: 'notify.feed', key: 'ghost' }] } },
        },
      },
    ]);
    expect(nested.code).toBe('referenced');
    const trig = refused(program, [
      { op: 'add', in: 'triggers', node: { kind: 'trigger.signal', key: 'ghost' } },
    ]);
    expect(trig.code).toBe('referenced');
  });
});
