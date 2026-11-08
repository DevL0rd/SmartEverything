import { describe, expect, it } from 'vitest';
import { automation, ifNode, start, step } from '../graph-fixtures';
import { chain, expectStructured, expectUndo, nodeAt, ok, refused, toOf } from './support';

const TIMES = { times: { lit: 2 } };

describe('wrap', () => {
  it('wraps a chain in an If: the row leads to the chain and Otherwise to what follows', () => {
    const done = ok(chain(), [
      { op: 'wrap', keys: ['a', 'b'], kind: 'flow.if', key: 'box', when: { lit: true } },
    ]);
    const box = nodeAt(done.program, 'box');
    expect(box.branches?.[0]?.to).toBe('a');
    expect(box.to).toEqual({ else: 'c' });
    expect(toOf(done.program, 'start', 'next')).toBe('box');
    expect(toOf(done.program, 'b', 'next')).toBe('c');
    expectStructured(done.program);
  });

  it('wraps a chain in a loop: the body is the chain, When done leads on', () => {
    const done = ok(chain(), [
      { op: 'wrap', keys: ['b'], kind: 'flow.repeat', key: 'again', ports: TIMES },
    ]);
    expect(nodeAt(done.program, 'again').to).toEqual({ body: 'b', next: 'c' });
    expect(toOf(done.program, 'a', 'next')).toBe('again');
    expect(nodeAt(done.program, 'b').to).toBeUndefined();
    expectStructured(done.program);
  });

  it('wraps a chain in Try', () => {
    const done = ok(chain(), [{ op: 'wrap', keys: ['a', 'b'], kind: 'flow.try', key: 'guarded' }]);
    expect(nodeAt(done.program, 'guarded').to).toEqual({ try: 'a', next: 'c' });
    expect(nodeAt(done.program, 'b').to).toBeUndefined();
    expectStructured(done.program);
  });

  it('wraps a chain in Do together and adds its Wait for all', () => {
    const done = ok(chain(), [{ op: 'wrap', keys: ['b'], kind: 'flow.parallel', key: 'fork' }]);
    const joinKey = done.created[1]?.key ?? '';
    expect(nodeAt(done.program, 'fork').paths).toEqual([
      { name: 'path1', to: 'b' },
      { name: 'path2', to: joinKey },
    ]);
    expect(toOf(done.program, 'b', 'next')).toBe(joinKey);
    expect(toOf(done.program, joinKey, 'next')).toBe('c');
    expectStructured(done.program);
  });

  it('wraps the end of a chain in Do together by wiring its last step into the join', () => {
    const done = ok(chain(), [{ op: 'wrap', keys: ['c'], kind: 'flow.parallel', key: 'fork' }]);
    const joinKey = done.created[1]?.key ?? '';
    expect(toOf(done.program, 'c', 'next')).toBe(joinKey);
    expectStructured(done.program);
  });

  it('wraps a decision whose branches stay inside the wrapped steps', () => {
    const program = automation([
      start('d'),
      ifNode('d', [{ name: 'x', to: 'y' }], 'z'),
      step('y', 'tail'),
      step('z', 'tail'),
      step('tail'),
    ]);
    const done = ok(program, [
      { op: 'wrap', keys: ['d', 'y', 'z'], kind: 'flow.repeat', ports: TIMES },
    ]);
    expect(toOf(done.program, 'start', 'next')).toBe(done.created[0]?.key);
    expectStructured(done.program);
  });

  it('refuses more than one way in or out, unwrappable kinds and bad keys', () => {
    const merging = automation([start('a'), step('a', 'b'), step('m', 'b'), step('b')]);
    expect(refused(merging, [{ op: 'wrap', keys: ['a', 'b'], kind: 'flow.try' }]).code).toBe(
      'not_allowed',
    );
    const splitting = automation([
      start('d'),
      ifNode('d', [{ name: 'x', to: 'y' }], 'z'),
      step('y'),
      step('z'),
    ]);
    expect(refused(splitting, [{ op: 'wrap', keys: ['d'], kind: 'flow.try' }]).reason).toContain(
      'way out',
    );
    expect(refused(chain(), [{ op: 'wrap', keys: ['b'], kind: 'device.set' }]).code).toBe(
      'not_allowed',
    );
    expect(refused(chain(), [{ op: 'wrap', keys: ['b'], kind: 'flow.if' }]).code).toBe(
      'not_allowed',
    );
    expect(
      refused(chain(), [{ op: 'wrap', keys: ['b'], kind: 'flow.try', when: { lit: true } }]).code,
    ).toBe('not_allowed');
    expect(refused(chain(), [{ op: 'wrap', keys: ['b', 'b'], kind: 'flow.try' }]).code).toBe(
      'not_allowed',
    );
    expect(refused(chain(), [{ op: 'wrap', keys: ['start'], kind: 'flow.try' }]).code).toBe(
      'not_allowed',
    );
    expect(refused(chain(), [{ op: 'wrap', keys: ['nope'], kind: 'flow.try' }]).code).toBe(
      'unknown_key',
    );
  });

  it('undoes every kind of wrap', () => {
    expectUndo(chain(), [{ op: 'wrap', keys: ['a', 'b'], kind: 'flow.if', when: { lit: true } }]);
    expectUndo(chain(), [{ op: 'wrap', keys: ['b'], kind: 'flow.repeat', ports: TIMES }]);
    expectUndo(chain(), [{ op: 'wrap', keys: ['a', 'b'], kind: 'flow.try' }]);
    expectUndo(chain(), [{ op: 'wrap', keys: ['b'], kind: 'flow.parallel' }]);
    expectUndo(chain(), [{ op: 'wrap', keys: ['c'], kind: 'flow.parallel' }]);
  });
});
