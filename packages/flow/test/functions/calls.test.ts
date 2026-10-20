import { describe, expect, it } from 'vitest';
import { callInstances, callsOf, functionIdOf, pinOf } from '../../src/functions/calls';
import { automation, call, fn, node } from './support';

describe('calls', () => {
  it('reads the function from a literal port only', () => {
    expect(functionIdOf(call('a', 'f1'))).toBe('f1');
    expect(functionIdOf(node('b', 'fn.call'))).toBeUndefined();
    expect(
      functionIdOf(node('b', 'fn.call', { fn: { wire: { from: 'x', port: 'id' } } })),
    ).toBeUndefined();
    expect(functionIdOf(node('b', 'fn.call', { fn: { lit: '' } }))).toBeUndefined();
    expect(functionIdOf(node('b', 'fn.call', { fn: { lit: 4 } }))).toBeUndefined();
  });

  it('reads the pin from the node or the pin port', () => {
    expect(pinOf(call('a', 'f1'))).toBeUndefined();
    expect(pinOf(call('a', 'f1', { pin: { revision: 3 } }))).toBe(3);
    expect(pinOf(call('a', 'f1', { pinPort: 2 }))).toBe(2);
    expect(pinOf(call('a', 'f1', { ports: { pin: { lit: 'x' } } }))).toBeUndefined();
  });

  it('finds instances in nested scopes and the failure scope', () => {
    const inner = call('inner', 'f2', { pin: { revision: 1 } });
    const program = automation(
      [
        call('first', 'f1'),
        node('other', 'flow.wait'),
        { ...node('loop', 'flow.repeat'), scopes: { body: { nodes: [inner] } } },
        node('nofn', 'fn.call'),
      ],
      { nodes: [call('onFail', 'f3')] },
    );
    expect(callInstances(program).map((entry) => entry.node.key)).toEqual(
      ['first', 'loop', 'inner', 'nofn', 'onFail'].filter((key) => key !== 'loop'),
    );
    expect(callsOf(program).map((entry) => [entry.key, entry.functionId, entry.pin])).toEqual([
      ['first', 'f1', undefined],
      ['inner', 'f2', 1],
      ['onFail', 'f3', undefined],
    ]);
    expect(callsOf(fn([])).length).toBe(0);
  });
});
