import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { automation, wired, lit, node, scope } from './c23-support';
import { findings, keysOf, only } from './lint-support';

function loop(key: string, kind: string, body: FlowNode[], ports = {}): FlowNode {
  return node(key, kind, ports, { scopes: { body: scope(...body) } });
}

const feed = (key: string): FlowNode => node(key, 'notify.feed', { message: lit('x') });
const lamp = (key: string): FlowNode =>
  node(key, 'device.set', { target: lit({ device: 'd1' }), control: lit('power'), to: lit(true) });

describe('lint of Break and Continue', () => {
  it('rejects them outside a loop', () => {
    const found = findings(automation([node('b', 'flow.break'), node('c', 'flow.continue')]));
    expect(keysOf(found, 'loop_control_outside_loop')).toEqual(['b', 'c']);
  });

  it('accepts them in a loop and checks a named target', () => {
    const inner = loop('inner', 'flow.repeat', [
      node('ok', 'flow.break', { target: lit('outer') }),
      node('bad', 'flow.continue', { target: lit('elsewhere') }),
      node('near', 'flow.continue'),
    ]);
    const outer = loop('outer', 'flow.repeat', [inner]);
    const found = findings(automation([outer]));
    expect(keysOf(found, 'unknown_loop_target')).toEqual(['bad']);
    expect(only(found, 'loop_control_outside_loop')).toEqual([]);
  });
});

describe('lint of Forever', () => {
  it('rejects a loop with no way out', () => {
    const found = findings(automation([loop('f', 'flow.forever', [feed('n')])]));
    expect(keysOf(found, 'forever_without_exit')).toEqual(['f']);
  });

  it('accepts a Break, Return or Stop inside', () => {
    for (const kind of ['flow.break', 'flow.return', 'flow.stop']) {
      const found = findings(automation([loop('f', 'flow.forever', [node('x', kind)])]));
      expect(only(found, 'forever_without_exit')).toEqual([]);
    }
  });

  it('accepts a limit as the way out', () => {
    const limited = loop('f', 'flow.forever', [feed('n')], {
      limit: lit({ time: 60_000, onLimit: 'end' }),
    });
    expect(only(findings(automation([limited])), 'forever_without_exit')).toEqual([]);
  });

  it('does not count a Break that leaves another loop', () => {
    const named = loop('f', 'flow.forever', [
      loop('inner', 'flow.repeat', [node('x', 'flow.break', { target: lit('inner') })]),
    ]);
    const inner = loop('f2', 'flow.forever', [
      loop('inner2', 'flow.repeat', [node('y', 'flow.break')]),
    ]);
    const found = findings(automation([named, inner]));
    expect(keysOf(found, 'forever_without_exit')).toEqual(['f', 'f2']);
  });

  it('counts a Break that names it from further in', () => {
    const named = loop('f', 'flow.forever', [
      loop('inner', 'flow.repeat', [node('x', 'flow.break', { target: lit('f') })]),
    ]);
    expect(only(findings(automation([named])), 'forever_without_exit')).toEqual([]);
  });
});

describe('lint of spinning loops', () => {
  it('warns about a loop that does nothing and never pauses', () => {
    const found = findings(
      automation([
        loop('w', 'flow.while', [], { condition: lit(true) }),
        loop('u', 'flow.do_until', [], { condition: lit(false), gap: lit(0) }),
      ]),
    );
    expect(keysOf(found, 'loop_spins')).toEqual(['w', 'u']);
  });

  it('accepts a gap, a wait or an effect', () => {
    const found = findings(
      automation([
        loop('gap', 'flow.while', [], { condition: lit(true), gap: lit(1000) }),
        loop('dyn', 'flow.while', [], { condition: lit(true), gap: wired('inputs.x') }),
        loop('wait', 'flow.while', [node('p', 'flow.wait', { duration: lit(1000) })], {
          condition: lit(true),
        }),
        loop('eff', 'flow.while', [feed('n')], { condition: lit(true) }),
        loop('call', 'flow.while', [node('c', 'fn.call', { fn: lit('f1') })], {
          condition: lit(true),
        }),
      ]),
    );
    expect(only(found, 'loop_spins')).toEqual([]);
  });
});

describe('lint of loops that send commands', () => {
  it('warns when a loop sends commands without a pause', () => {
    const found = findings(
      automation([
        loop('r', 'flow.repeat', [lamp('a')], { times: lit(3) }),
        loop('p', 'flow.repeat', [lamp('b')], { times: lit(3), gap: lit(500) }),
        loop('q', 'flow.repeat', [lamp('c'), node('w', 'flow.wait', { duration: lit(100) })], {
          times: lit(3),
        }),
        loop('n', 'flow.repeat', [feed('d')], { times: lit(3) }),
      ]),
      { known: new Set(['d1']) },
    );
    expect(keysOf(found, 'loop_commands_without_wait')).toEqual(['r']);
  });
});

describe('lint of polling loops', () => {
  it('offers Wait until true for a do until that only checks a wire', () => {
    const named = node('named', 'logic.compare', {
      a: wired('home.name'),
      op: lit('eq'),
      b: lit('y'),
    });
    const found = findings(
      automation([
        named,
        loop('w', 'flow.while', [], { condition: wired('named.result'), gap: lit(1000) }),
        loop('u', 'flow.do_until', [], { condition: wired('named.result'), gap: lit(1000) }),
      ]),
    );
    const hits = only(found, 'polling_loop');
    expect(hits.map((item) => item.fix?.action)).toEqual([
      undefined,
      { action: 'wait_until', key: 'u', condition: { wire: { from: 'named', port: 'result' } } },
    ]);
  });

  it('gives only advice when the condition is not a wire', () => {
    const found = findings(
      automation([
        loop('fixed', 'flow.while', [], { condition: lit(true), gap: lit(1000) }),
        loop('none', 'flow.do_until', [], { gap: lit(1000) }),
      ]),
    );
    const hits = only(found, 'polling_loop');
    expect(hits).toHaveLength(2);
    expect(hits.every((item) => item.fix?.action === undefined)).toBe(true);
  });

  it('leaves loops that do things or never pause', () => {
    const found = findings(
      automation([
        loop('busy', 'flow.while', [feed('n')], { condition: lit(true), gap: lit(1000) }),
        loop('fast', 'flow.while', [], { condition: lit(true) }),
      ]),
    );
    expect(only(found, 'polling_loop')).toEqual([]);
  });
});
