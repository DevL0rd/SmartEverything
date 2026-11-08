import { describe, expect, it } from 'vitest';
import { automation, ifNode, start, step, value } from '../graph-fixtures';
import { chain, expectStructured, expectUndo, nodeAt, ok, refused, toOf } from './support';

describe('rename', () => {
  it('rewrites exec targets in every kind of exit', () => {
    const program = automation([start('d'), ifNode('d', [{ name: 'x', to: 'y' }], 'y'), step('y')]);
    const done = ok(program, [{ op: 'rename', key: 'y', to: 'yes' }]);
    expect(done.program.nodes[1]?.branches?.[0]?.to).toBe('yes');
    expect(toOf(done.program, 'd', 'else')).toBe('yes');
    expect(done.program.nodes.map((node) => node.key)).toEqual(['start', 'd', 'yes']);
  });

  it('rewrites the wire from Start and plain Then targets', () => {
    const done = ok(chain(), [{ op: 'rename', key: 'a', to: 'first' }]);
    expect(toOf(done.program, 'start', 'next')).toBe('first');
    expectStructured(done.program);
  });

  it('rewrites value wires that read the renamed node', () => {
    const program = automation([
      start('a'),
      value('reading'),
      step('a', undefined, { ports: { level: { wire: { from: 'reading', port: 'value' } } } }),
    ]);
    const done = ok(program, [{ op: 'rename', key: 'reading', to: 'sensor' }]);
    expect(nodeAt(done.program, 'a').ports?.['level']).toEqual({
      wire: { from: 'sensor', port: 'value' },
    });
  });

  it('refuses a taken key, a reserved key, an unknown key and a read-through', () => {
    expect(refused(chain(), [{ op: 'rename', key: 'a', to: 'b' }]).code).toBe('key_taken');
    expect(refused(chain(), [{ op: 'rename', key: 'a', to: 'Bad' }]).code).toBe('key_taken');
    expect(refused(chain(), [{ op: 'rename', key: 'nope', to: 'x' }]).code).toBe('unknown_key');
    const reading = automation([
      start('a'),
      step('a', undefined, { ports: { level: { wire: { from: 'later', port: 'value' } } } }),
    ]);
    expect(refused(reading, [{ op: 'rename', key: 'a', to: 'later' }]).code).toBe('referenced');
  });

  it('undoes a rename', () => {
    expectUndo(chain(), [{ op: 'rename', key: 'b', to: 'second' }]);
  });
});
